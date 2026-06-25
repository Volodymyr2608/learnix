# Instructor Mobile — Charts (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria.

**Goal:** Make the six instructor Recharts charts legible at 375px without regressing the desktop
(`≥md`) layout, by thinning time-axis ticks with pure Recharts props and switching money-axis
formatting / course-label truncation only on mobile via a new `useIsMobile()` hook.

**Architecture:** Tick collisions are solved with **pure props** (`interval="preserveStartEnd"` +
`minTickGap`), which Recharts resolves from rendered width on every viewport. Width-dependent
*content* changes (compact money axis, course-title truncation) read a new SSR-safe
`useIsMobile()` hook so the desktop charts stay pixel-identical (hook returns `false` on server and
`≥md`). Two pure helpers — `formatUsdCompact` and `truncateLabel` — carry the only unit-testable
logic.

**Tech Stack:** Next.js 16 App Router (client components), Recharts (already a dependency), Vitest
(`--project unit`, node env — **no DOM/RTL**, so only pure functions get unit tests), Tailwind v4
(`md` = 768px).

**Codebase anchors (verified during planning):**
- `formatUsd` (`lib/formatUsd.ts`) — `export function formatUsd(cents: number): string`; rounds
  cents→whole dollars, `$0` for zero. Its test file `lib/formatUsd.test.ts` is the unit-test
  pattern to mirror.
- `_shared/hooks` convention (`app/_components/_shared/hooks/useDragAndDrop.ts`) — `"use client"`,
  arrow-function `const`, **default export**.
- Chart components are all `"use client"` and render a skeleton while their tRPC query
  `isLoading` — `RevenueOverTimeChart`, `RevenueByCourseChart`
  (`app/_components/Instructor/Revenue/components/…`), `DashboardRevenueChart`
  (`app/_components/Instructor/DashboardRevenueChart`), `EnrollmentTrendChart`,
  `CompletionTrendChart`, `EnrollmentsByCourseChart`
  (`app/_components/Instructor/Analytics/components/…`).
- `EnrollmentTrendChart` is reused by `CourseAnalyticsCharts`
  (`app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsCharts/index.tsx`), so
  fixing it covers the per-course analytics page too.
- Single-file unit run: `pnpm vitest run --project unit <path>`.

**Per-task conventions:**
- After each implementation step, `pnpm typecheck` **and** `pnpm check` must be clean before the
  commit step.
- Unit tests are colocated `*.test.ts`, node env, pure functions only.
- New components/helpers are arrow-function consts (CLAUDE.md). **Exception:** `formatUsdCompact`
  lives in `lib/formatUsd.ts` and mirrors that file's existing `export function` style for local
  consistency (same exception rationale the foundation plan used for `Sheet`).
- The one allowed ternary is a single binary branch (`isMobile ? a : b`); no nested ternaries.
- No change to any chart at `≥md` (768px) — these tasks only alter mobile content.

---

## Task 1: `formatUsdCompact` money helper

**Files:**
- Modify: `lib/formatUsd.ts`
- Test: `lib/formatUsd.test.ts`

**Interfaces:**
- Produces: `export function formatUsdCompact(cents: number): string` — `$0`, `$950`, `$1.2k`,
  `$95.2k`, `$1M`, `$1.1M`. Consumed by Task 4's revenue y-axis tick formatters.

- [ ] **Step 1: Write the failing tests**

Append to `lib/formatUsd.test.ts`:

```ts
import { formatUsd, formatUsdCompact } from "./formatUsd";

describe("formatUsdCompact", () => {
	it("shows $0 for zero", () => {
		expect(formatUsdCompact(0)).toBe("$0");
	});

	it("keeps full dollars under 1,000", () => {
		expect(formatUsdCompact(95000)).toBe("$950");
		expect(formatUsdCompact(99900)).toBe("$999");
	});

	it("uses k for thousands, dropping a trailing .0", () => {
		expect(formatUsdCompact(120000)).toBe("$1.2k");
		expect(formatUsdCompact(9515000)).toBe("$95.2k");
		expect(formatUsdCompact(500000000)).toBe("$5M"); // 5,000,000 -> M, not 5000k
	});

	it("uses M for millions, dropping a trailing .0", () => {
		expect(formatUsdCompact(100000000)).toBe("$1M");
		expect(formatUsdCompact(110000000)).toBe("$1.1M");
	});

	it("never returns a negative-zero string", () => {
		expect(formatUsdCompact(-0)).toBe("$0");
	});
});
```

(Update the existing top `import { formatUsd } from "./formatUsd";` line to the combined import
above.)

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit lib/formatUsd.test.ts`
Expected: FAIL — `formatUsdCompact is not a function` / not exported.

- [ ] **Step 3: Implement minimally**

Append to `lib/formatUsd.ts`:

```ts
const oneDecimal = (n: number): string => {
	const rounded = Math.round(n * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * Compact whole-dollar USD for chart axis ticks, e.g. 9515000 -> "$95.2k",
 * 110000000 -> "$1.1M". Shows "$0" for zero. Tooltips keep full `formatUsd`.
 */
export function formatUsdCompact(cents: number): string {
	const dollars = Math.round(cents / 100);
	const safe = dollars === 0 ? 0 : dollars; // normalise -0
	const abs = Math.abs(safe);
	if (abs < 1000) return `$${safe}`;
	if (abs < 1_000_000) return `$${oneDecimal(safe / 1000)}k`;
	return `$${oneDecimal(safe / 1_000_000)}M`;
}
```

- [ ] **Step 4: Run tests + typecheck + lint, expect PASS**

Run: `pnpm vitest run --project unit lib/formatUsd.test.ts && pnpm typecheck && pnpm check`
Expected: PASS (all formatUsd + formatUsdCompact tests green, no type/lint errors).

- [ ] **Step 5: Commit**

```bash
git add lib/formatUsd.ts lib/formatUsd.test.ts
git commit -m "feat(instructor-mobile): add formatUsdCompact for chart axis ticks"
```

---

## Task 2: `useIsMobile` hook

**Files:**
- Create: `app/_components/_shared/hooks/useIsMobile.ts`

**Interfaces:**
- Produces: `const useIsMobile: () => boolean` (default export). Returns `false` on the server and
  first client render, then `true` while the viewport matches `(max-width: 767px)`. Consumed by
  Tasks 4 and 5.

> No unit test: the hook depends on `window.matchMedia`, and the Vitest unit project runs in a
> `node` environment with no DOM (and the repo has no RTL/jsdom). It is gated by `pnpm typecheck`
> and verified live in Task 6. Do **not** add jsdom/RTL for this (out of scope, YAGNI).

- [ ] **Step 1: Create the hook**

Create `app/_components/_shared/hooks/useIsMobile.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)"; // below Tailwind `md` (768px)

const useIsMobile = (): boolean => {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const mql = window.matchMedia(MOBILE_QUERY);
		const onChange = () => setIsMobile(mql.matches);
		onChange();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isMobile;
};

export default useIsMobile;
```

- [ ] **Step 2: Typecheck + lint, expect clean**

Run: `pnpm typecheck && pnpm check`
Expected: PASS — no type or lint errors.

- [ ] **Step 3: Commit**

```bash
git add app/_components/_shared/hooks/useIsMobile.ts
git commit -m "feat(instructor-mobile): add useIsMobile hook"
```

---

## Task 3: Thin time-axis ticks on all time-series charts (pure props)

**Files:**
- Modify: `app/_components/Instructor/DashboardRevenueChart/index.tsx`
- Modify: `app/_components/Instructor/Revenue/components/RevenueOverTimeChart/index.tsx`
- Modify: `app/_components/Instructor/Analytics/components/EnrollmentTrendChart/index.tsx`
- Modify: `app/_components/Instructor/Analytics/components/CompletionTrendChart/index.tsx`

> No unit test (pure JSX prop change, no DOM env). Gated by typecheck/lint + Task 6 viewport check.

- [ ] **Step 1: Add thinning props to each `<XAxis>`**

In each of the four files, the `<XAxis>` with `dataKey="period"` currently has
`axisLine={false}`, `tickFormatter={…"MMM"…}`, `tickLine={false}`, `tickMargin={8}`. Add two
props to **each** of them:

```tsx
<XAxis
	axisLine={false}
	dataKey="period"
	interval="preserveStartEnd"
	minTickGap={24}
	tickFormatter={(v: string) => format(parseISO(v), "MMM")}
	tickLine={false}
	tickMargin={8}
/>
```

(Keep every existing prop and the existing `tickFormatter` body verbatim — only `interval` and
`minTickGap` are new. `CompletionTrendChart` uses a `LineChart`; the `<XAxis>` change is identical.)

- [ ] **Step 2: Typecheck + lint, expect clean**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/Instructor/DashboardRevenueChart/index.tsx \
  app/_components/Instructor/Revenue/components/RevenueOverTimeChart/index.tsx \
  app/_components/Instructor/Analytics/components/EnrollmentTrendChart/index.tsx \
  app/_components/Instructor/Analytics/components/CompletionTrendChart/index.tsx
git commit -m "feat(instructor-mobile): thin colliding month ticks on time-series charts"
```

---

## Task 4: Compact money y-axis on mobile (revenue charts)

**Files:**
- Modify: `app/_components/Instructor/DashboardRevenueChart/index.tsx`
- Modify: `app/_components/Instructor/Revenue/components/RevenueOverTimeChart/index.tsx`

**Interfaces:**
- Consumes: `useIsMobile` (Task 2), `formatUsdCompact` (Task 1).

> No unit test (hook needs DOM). Gated by typecheck/lint + Task 6 viewport check.

- [ ] **Step 1: Wire the hook + compact formatter in `DashboardRevenueChart`**

Add imports at the top of `DashboardRevenueChart/index.tsx`:

```ts
import useIsMobile from "@/app/_components/_shared/hooks/useIsMobile";
import { formatUsd, formatUsdCompact } from "@/lib/formatUsd";
```

(Replace the existing `import { formatUsd } from "@/lib/formatUsd";` line.)

Inside the component body, read the hook (top of the function, before `const hasData`):

```tsx
const isMobile = useIsMobile();
```

Change the `<YAxis>` tick formatter from `formatUsd(v)` to a mobile-aware single binary branch:

```tsx
<YAxis
	axisLine={false}
	tickFormatter={(v: number) => (isMobile ? formatUsdCompact(v) : formatUsd(v))}
	tickLine={false}
	tickMargin={8}
/>
```

Leave the `<ChartTooltip>` `formatter={(value) => formatUsd(value)}` untouched (tooltips stay
full precision).

- [ ] **Step 2: Repeat for `RevenueOverTimeChart`**

Same edit in `RevenueOverTimeChart/index.tsx`: add the same two imports (replacing its
`import { formatUsd } …` line), add `const isMobile = useIsMobile();` at the top of the component
body, and change its `<YAxis tickFormatter={(v: number) => formatUsd(v)}>` to
`tickFormatter={(v: number) => (isMobile ? formatUsdCompact(v) : formatUsd(v))}`. Leave its
`ChartTooltip` formatter as `formatUsd`.

- [ ] **Step 3: Typecheck + lint, expect clean**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/DashboardRevenueChart/index.tsx \
  app/_components/Instructor/Revenue/components/RevenueOverTimeChart/index.tsx
git commit -m "feat(instructor-mobile): compact revenue y-axis ticks on mobile"
```

---

## Task 5: Truncate course-title labels on mobile (`RevenueByCourseChart`)

**Files:**
- Create: `app/_components/Instructor/Revenue/components/RevenueByCourseChart/utils.ts`
- Create: `app/_components/Instructor/Revenue/components/RevenueByCourseChart/utils.test.ts`
- Modify: `app/_components/Instructor/Revenue/components/RevenueByCourseChart/index.tsx`

**Interfaces:**
- Produces: `export const truncateLabel: (value: string, max: number) => string`.
- Consumes: `useIsMobile` (Task 2).

- [ ] **Step 1: Write the failing test for `truncateLabel`**

Create `…/RevenueByCourseChart/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { truncateLabel } from "./utils";

describe("truncateLabel", () => {
	it("returns short strings unchanged", () => {
		expect(truncateLabel("React Basics", 14)).toBe("React Basics");
	});

	it("returns a string exactly at the limit unchanged", () => {
		expect(truncateLabel("Fourteen chars", 14)).toBe("Fourteen chars");
	});

	it("truncates longer strings with a trailing ellipsis at the limit", () => {
		const out = truncateLabel("Advanced TypeScript Patterns", 14);
		expect(out).toBe("Advanced Type…");
		expect(out).toHaveLength(14);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit app/_components/Instructor/Revenue/components/RevenueByCourseChart/utils.test.ts`
Expected: FAIL — cannot find `./utils`.

- [ ] **Step 3: Implement `truncateLabel`**

Create `…/RevenueByCourseChart/utils.ts`:

```ts
/** Truncate to `max` chars inclusive of a trailing ellipsis; shorter strings pass through. */
export const truncateLabel = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm vitest run --project unit app/_components/Instructor/Revenue/components/RevenueByCourseChart/utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the chart's category axis**

In `RevenueByCourseChart/index.tsx` add imports:

```ts
import useIsMobile from "@/app/_components/_shared/hooks/useIsMobile";
import { truncateLabel } from "./utils";
```

Read the hook at the top of the component body:

```tsx
const isMobile = useIsMobile();
```

Update the category `<YAxis>` (the one with `dataKey="title"`, `type="category"`, `width={90}`)
to force all bars to render a tick and to truncate only on mobile:

```tsx
<YAxis
	axisLine={false}
	dataKey="title"
	interval={isMobile ? 0 : undefined}
	tickFormatter={(v: string) => (isMobile ? truncateLabel(v, 14) : v)}
	tickLine={false}
	tickMargin={8}
	type="category"
	width={90}
/>
```

The `<ChartTooltip>` stays as-is — its label is the row's full `title` from the data (the
`tickFormatter` only affects axis rendering), so the full course title still shows on tap.

- [ ] **Step 6: Typecheck + lint, expect clean**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_components/Instructor/Revenue/components/RevenueByCourseChart/
git commit -m "feat(instructor-mobile): truncate revenue-by-course labels on mobile"
```

---

## Task 6: Final verification (live viewport check + docs gate)

**Files:**
- Modify: `docs/specs/features/instructor-mobile/spec.md` (status → `stable`)
- Modify: `docs/specs/features/_index.md` (regenerated)

- [ ] **Step 1: Full static gate**

Run: `pnpm typecheck && pnpm check && pnpm test:unit`
Expected: PASS — types clean, lint clean, all unit tests (incl. `formatUsdCompact`,
`truncateLabel`) green.

- [ ] **Step 2: Live mobile check (instructor, signed in)**

Start the app (`pnpm dev`) and, signed in as an instructor with sales/enrollment data, use the
Playwright browser tools at a **375×812** viewport to confirm each acceptance criterion:
- `/instructor` — Revenue Overview chart: month ticks readable (thinned), no x-axis overlap,
  y-axis shows compact `$…k`/`$…M`, no page-body horizontal scroll.
- `/instructor/revenue` — over-time chart (compact y-axis, thinned ticks) and "Revenue by Course"
  (labels truncated with `…`; tapping a bar shows the full title in the tooltip).
- `/instructor/analytics` — enrollment/completion trends (thinned ticks); "Enrollments by Course"
  pie + legend stack cleanly.
- `/instructor/courses/<id>/analytics` — enrollment trend (thinned ticks).

- [ ] **Step 3: Live desktop no-regression check**

At a **1440** viewport, confirm the same pages render as before this branch: full month ticks
where width allows, full-precision dollar y-axis (`$1,234`), untruncated course-title labels.

- [ ] **Step 4: Docs gate (DoD)**

Set `status: stable` in `docs/specs/features/instructor-mobile/spec.md`, then run:

```bash
pnpm spec:sync
```

Expected: `docs/specs/features/_index.md` regenerates with `instructor-mobile | stable`.

- [ ] **Step 5: Commit**

```bash
git add docs/specs/features/instructor-mobile/spec.md docs/specs/features/_index.md
git commit -m "docs(instructor-mobile): mark charts stage stable"
```

---

## Final verification

- All five chart acceptance criteria in [`../spec.md`](../spec.md) confirmed at 375px (Task 6.2).
- Desktop (`≥md`) pixel-identical confirmed at 1440px (Task 6.3) — `useIsMobile()` returns `false`,
  so revenue axes use full `formatUsd` and course labels are untruncated.
- `pnpm typecheck`, `pnpm check`, `pnpm test:unit` all clean (Task 6.1).
- No hydration-mismatch warning in the console on first load of any instructor chart page
  (observed during Task 6.2).