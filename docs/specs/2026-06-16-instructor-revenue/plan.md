# Instructor Revenue Page & Dashboard Revenue Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken mock `/instructor/revenue` page with a real, instructor-scoped revenue surface (summary cards, revenue-over-time + revenue-by-course charts, recent transactions, automatic-payout management) and replace the dashboard's dashed "Revenue Overview" placeholder with a real revenue-over-time chart.

**Architecture:** Four read-only `instructorProcedure` queries on the `payment` router (composing existing earnings aggregates + two new repository methods) feed a `"use client"` `RevenueOverview` page that owns the range state, plus one RSC-fetched dashboard chart island. No schema changes — all figures derive from existing `Payment` columns.

**Tech Stack:** Next.js 16 (RSC + client islands), tRPC, Prisma (raw `date_trunc` + `groupBy`), recharts, Vitest, TypeScript, Tailwind + Radix primitives.

---

## File Structure

**New**
- `lib/formatUsd.ts` + `lib/formatUsd.test.ts` — whole-dollar USD formatter (`$0`, thousands separators).
- `lib/stats/revenueRange.ts` + `lib/stats/revenueRange.test.ts` — pure `resolveRange(range, now?)`.
- `server/entities/payment/revenue.ts` — DTOs + `revenueRangeSchema`.
- `server/repositories/payment.repository.integration.test.ts` — *(modified)* add cases for the two new methods.
- `server/services/payments/payment.service.test.ts` — new unit tests for the four service methods.
- `app/_components/_shared/ui/chart.tsx` — shadcn recharts wrapper.
- `app/_components/_shared/ui/table.tsx` — shadcn table primitives.
- `lib/requests/instructor/getRevenueTimeSeries.ts` — RSC fetch wrapper (`"12m"`, `[]` fallback).
- `app/_components/Instructor/DashboardRevenueChart/{index.tsx,types.ts}` — dashboard chart island.
- `app/_components/Instructor/Revenue/index.tsx` — `RevenueOverview` client orchestrator.
- `app/_components/Instructor/Revenue/types.ts` — all prop types.
- `app/_components/Instructor/Revenue/helpers.ts` — status-label/variant + range-option helpers.
- `app/_components/Instructor/Revenue/components/{RevenueSummaryCards,RevenuePayouts,RevenueRangeSelect,RevenueOverTimeChart,RevenueByCourseChart,RevenueTransactionsTable}.tsx`.

**Modified**
- `server/repositories/payment.repository.ts` — add `getRevenueByBucket`, `getRevenueGroupedByCourse`.
- `server/services/payments/payment.service.ts` — add `getRevenueSummary`, `getRevenueTimeSeries`, `getRevenueByCourse`, `getRecentTransactions`.
- `server/api/routers/payment.ts` — add 4 `instructorProcedure` queries.
- `server/entities/payment/index.ts` — re-export `./revenue`.
- `app/instructor/page.tsx` — swap the dashed placeholder for `<DashboardRevenueChart>`.
- `app/instructor/revenue/page.tsx` — rewrite as Server Component rendering `<RevenueOverview/>`.
- `package.json` — add `recharts`.

---

## Task 1: Whole-dollar USD formatter

**Files:**
- Create: `lib/formatUsd.ts`
- Test: `lib/formatUsd.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/formatUsd.test.ts
import { describe, expect, it } from "vitest";
import { formatUsd } from "./formatUsd";

describe("formatUsd", () => {
	it("formats zero as $0 (not 'Free')", () => {
		expect(formatUsd(0)).toBe("$0");
	});

	it("rounds cents to whole dollars with thousands separators", () => {
		expect(formatUsd(9515000)).toBe("$95,150");
	});

	it("rounds to the nearest dollar", () => {
		expect(formatUsd(8999)).toBe("$90");
	});

	it("never returns a negative-zero string", () => {
		expect(formatUsd(-0)).toBe("$0");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/formatUsd.test.ts`
Expected: FAIL — cannot find module `./formatUsd`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/formatUsd.ts
/** Whole-dollar USD, e.g. 9515000 -> "$95,150". Shows "$0" (not "Free") for zero. */
export function formatUsd(cents: number): string {
	const dollars = Math.round(cents / 100);
	const safe = dollars === 0 ? 0 : dollars; // normalise -0
	return `$${safe.toLocaleString("en-US")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/formatUsd.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/formatUsd.ts lib/formatUsd.test.ts
git commit -m "feat(revenue): add whole-dollar USD formatter"
```

---

## Task 2: Range resolver

Pure helper mapping a `RevenueRange` to a query window + bucket unit. `"30d"` → daily buckets; `"6m"`/`"12m"` → monthly buckets aligned to month starts.

**Files:**
- Create: `lib/stats/revenueRange.ts`
- Test: `lib/stats/revenueRange.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/stats/revenueRange.test.ts
import { describe, expect, it } from "vitest";
import { resolveRange } from "./revenueRange";

describe("resolveRange", () => {
	it("30d → daily bucket, since = 30 days before now", () => {
		const now = new Date(2026, 5, 16, 12, 0, 0); // 2026-06-16
		expect(resolveRange("30d", now)).toEqual({
			since: new Date(2026, 4, 17, 12, 0, 0), // 30 days earlier
			bucket: "day",
		});
	});

	it("6m → monthly bucket, since = start of the month 5 months ago", () => {
		const now = new Date(2026, 5, 16); // June 2026
		expect(resolveRange("6m", now)).toEqual({
			since: new Date(2026, 0, 1), // Jan 2026 (6-month inclusive window)
			bucket: "month",
		});
	});

	it("12m → monthly bucket, since = start of the month 11 months ago", () => {
		const now = new Date(2026, 5, 16); // June 2026
		expect(resolveRange("12m", now)).toEqual({
			since: new Date(2025, 6, 1), // Jul 2025
			bucket: "month",
		});
	});

	it("handles year rollover for 12m", () => {
		const now = new Date(2026, 1, 10); // Feb 2026
		expect(resolveRange("12m", now)).toEqual({
			since: new Date(2025, 2, 1), // Mar 2025
			bucket: "month",
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/stats/revenueRange.test.ts`
Expected: FAIL — cannot find module `./revenueRange`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/stats/revenueRange.ts
import { subDays, subMonths } from "date-fns";
import type { RevenueRange } from "@/server/entities/payment/revenue";

export type ResolvedRange = { since: Date; bucket: "day" | "month" };

/** Maps a range preset to its query window start and time-bucket unit. */
export function resolveRange(
	range: RevenueRange,
	now: Date = new Date(),
): ResolvedRange {
	if (range === "30d") {
		return { since: subDays(now, 30), bucket: "day" };
	}
	const monthsBack = range === "6m" ? 5 : 11;
	const start = subMonths(now, monthsBack);
	return { since: new Date(start.getFullYear(), start.getMonth(), 1), bucket: "month" };
}
```

> Note: `RevenueRange` is defined in Task 3; importing it before that task means this file won't type-check until Task 3 lands. Run Tasks 2 and 3 together if executing strictly, or define Task 3 first.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/stats/revenueRange.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stats/revenueRange.ts lib/stats/revenueRange.test.ts
git commit -m "feat(revenue): add range→bucket resolver"
```

---

## Task 3: Revenue DTOs & input schema

**Files:**
- Create: `server/entities/payment/revenue.ts`
- Modify: `server/entities/payment/index.ts`

- [ ] **Step 1: Create the entities file**

```ts
// server/entities/payment/revenue.ts
import { z } from "zod";
import type { StatDelta } from "@/server/entities/instructor/dashboard";

export const revenueRangeSchema = z.enum(["30d", "6m", "12m"]);
export type RevenueRange = z.infer<typeof revenueRangeSchema>;

export const revenueRangeInput = z.object({ range: revenueRangeSchema });
export const recentTransactionsInput = z.object({
	limit: z.number().int().min(1).max(50).default(10),
});

export type RevenueSummary = {
	totalGrossCents: number;
	thisMonth: { grossCents: number; delta: StatDelta };
	paidOutCents: number;
	pendingCents: number;
};

export type RevenueTimeSeriesPoint = {
	period: string; // ISO date marking the bucket start
	grossCents: number;
	netCents: number;
};

export type RevenueByCourseItem = {
	courseId: string;
	title: string;
	grossCents: number;
};

export type RevenueTransactionStatus =
	| "completed"
	| "pending"
	| "refunded"
	| "failed";

export type RevenueTransaction = {
	id: string;
	courseTitle: string;
	studentName: string;
	createdAt: Date;
	amountCents: number;
	status: RevenueTransactionStatus;
};
```

- [ ] **Step 2: Re-export from the payment entities index**

Open `server/entities/payment/index.ts` and add this line (keep existing exports):

```ts
export * from "./revenue";
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm typecheck`
Expected: PASS (no errors from the new file).

- [ ] **Step 4: Commit**

```bash
git add server/entities/payment/revenue.ts server/entities/payment/index.ts
git commit -m "feat(revenue): add revenue DTOs and range input schema"
```

---

## Task 4: Repository — `getRevenueByBucket`

Raw SQL `date_trunc` aggregation of gross + net per time bucket, matching the canonical revenue filter (`status='succeeded' AND refunded_at IS NULL`). Column names follow the Prisma `@map` in `prisma/schema/payments.prisma` (`amount_cents`, `instructor_net_cents`, `created_at`; `instructorId` is unmapped/camelCase; table is `payments`).

**Files:**
- Modify: `server/repositories/payment.repository.ts`
- Test: `server/repositories/payment.repository.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Add inside the existing `describe("PaymentRepository", …)` block (reuse the file's `makePayment` helper):

```ts
	it("getRevenueByBucket sums gross and net per month, excluding refunded/failed", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		// Two succeeded sales in Mar 2026 + one refunded (excluded).
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 10000,
			instructorNetCents: 8000,
			createdAt: new Date(2026, 2, 5),
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 5000,
			instructorNetCents: 4000,
			createdAt: new Date(2026, 2, 20),
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 9999,
			instructorNetCents: 8000,
			status: "refunded",
			refundedAt: new Date(2026, 2, 25),
			createdAt: new Date(2026, 2, 25),
		});

		const rows = await paymentRepository.getRevenueByBucket(
			instructor.id,
			new Date(2026, 0, 1),
			"month",
		);

		const march = rows.find(
			(r) => r.period.getUTCMonth() === 2 && r.period.getUTCFullYear() === 2026,
		);
		expect(march?.grossCents).toBe(15000);
		expect(march?.netCents).toBe(12000);
	});

	it("getRevenueByBucket scopes to the instructor", async () => {
		const a = await makeUser({ role: Role.INSTRUCTOR });
		const b = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const courseB = await makeCourse({ instructorId: b.id, status: "published" });
		await makePayment({
			studentId: student.id,
			instructorId: b.id,
			courseId: courseB.id,
			amountCents: 10000,
			createdAt: new Date(2026, 2, 5),
		});

		const rows = await paymentRepository.getRevenueByBucket(
			a.id,
			new Date(2026, 0, 1),
			"month",
		);
		expect(rows).toHaveLength(0);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration payment.repository`
Expected: FAIL — `paymentRepository.getRevenueByBucket is not a function`.

- [ ] **Step 3: Implement the method**

In `server/repositories/payment.repository.ts`, add to the `PaymentRepository` class (the file already imports `db`):

```ts
	async getRevenueByBucket(
		instructorId: string,
		since: Date,
		bucket: "day" | "month",
	): Promise<{ period: Date; grossCents: number; netCents: number }[]> {
		const rows = await db.$queryRaw<
			{ period: Date; gross: bigint | null; net: bigint | null }[]
		>`
			SELECT date_trunc(${bucket}, created_at) AS period,
			       SUM(amount_cents) AS gross,
			       SUM(instructor_net_cents) AS net
			FROM payments
			WHERE "instructorId" = ${instructorId}
			  AND status = 'succeeded'
			  AND refunded_at IS NULL
			  AND created_at >= ${since}
			GROUP BY period
			ORDER BY period ASC
		`;
		return rows.map((r) => ({
			period: r.period,
			grossCents: Number(r.gross ?? 0),
			netCents: Number(r.net ?? 0),
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration payment.repository`
Expected: PASS (new cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/payment.repository.ts server/repositories/payment.repository.integration.test.ts
git commit -m "feat(revenue): add getRevenueByBucket repo query"
```

---

## Task 5: Repository — `getRevenueGroupedByCourse`

Top courses by gross within a window, via Prisma `groupBy` (no raw SQL needed).

**Files:**
- Modify: `server/repositories/payment.repository.ts`
- Test: `server/repositories/payment.repository.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
	it("getRevenueGroupedByCourse returns courses ranked by gross, capped by limit", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const c1 = await makeCourse({ instructorId: instructor.id, status: "published" });
		const c2 = await makeCourse({ instructorId: instructor.id, status: "published" });

		await makePayment({
			studentId: student.id, instructorId: instructor.id, courseId: c1.id,
			amountCents: 3000, createdAt: new Date(2026, 2, 1),
		});
		await makePayment({
			studentId: student.id, instructorId: instructor.id, courseId: c2.id,
			amountCents: 8000, createdAt: new Date(2026, 2, 2),
		});

		const rows = await paymentRepository.getRevenueGroupedByCourse(
			instructor.id,
			new Date(2026, 0, 1),
			5,
		);
		expect(rows.map((r) => ({ courseId: r.courseId, grossCents: r.grossCents }))).toEqual([
			{ courseId: c2.id, grossCents: 8000 },
			{ courseId: c1.id, grossCents: 3000 },
		]);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration payment.repository`
Expected: FAIL — `getRevenueGroupedByCourse is not a function`.

- [ ] **Step 3: Implement the method**

```ts
	async getRevenueGroupedByCourse(
		instructorId: string,
		since: Date,
		limit: number,
	): Promise<{ courseId: string; grossCents: number }[]> {
		const grouped = await db.payment.groupBy({
			by: ["courseId"],
			where: {
				instructorId,
				status: "succeeded",
				refundedAt: null,
				createdAt: { gte: since },
			},
			_sum: { amountCents: true },
			orderBy: { _sum: { amountCents: "desc" } },
			take: limit,
		});
		return grouped.map((g) => ({
			courseId: g.courseId,
			grossCents: g._sum.amountCents ?? 0,
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration payment.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/payment.repository.ts server/repositories/payment.repository.integration.test.ts
git commit -m "feat(revenue): add getRevenueGroupedByCourse repo query"
```

---

## Task 6: Service — `getRevenueSummary`

Composes the existing `getInstructorEarnings` (lifetime gross, available, owed) + `getInstructorRevenueStats` (this/last-month gross) + the pure `computeDelta`.

**Files:**
- Modify: `server/services/payments/payment.service.ts`
- Test: `server/services/payments/payment.service.test.ts` (new file)

- [ ] **Step 1: Write the failing unit test**

```ts
// server/services/payments/payment.service.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { paymentService } from "./payment.service";

afterEach(() => vi.restoreAllMocks());

describe("paymentService.getRevenueSummary", () => {
	it("maps earnings + month stats into the summary DTO with a delta", async () => {
		vi.spyOn(paymentService, "getInstructorEarnings").mockResolvedValue({
			availableCents: 8420,
			owedCents: 2180,
			lifetimeGrossCents: 95150,
			platformFeesCents: 19030,
		});
		vi.spyOn(paymentRepository, "getInstructorRevenueStats").mockResolvedValue({
			lifetimeGrossCents: 95150,
			thisMonthGrossCents: 12450,
			lastMonthGrossCents: 11500,
		});

		const summary = await paymentService.getRevenueSummary("inst_1");

		expect(summary.totalGrossCents).toBe(95150);
		expect(summary.paidOutCents).toBe(8420);
		expect(summary.pendingCents).toBe(2180);
		expect(summary.thisMonth.grossCents).toBe(12450);
		expect(summary.thisMonth.delta).toEqual({
			kind: "percent",
			value: 8,
			direction: "up",
		});
	});

	it("returns a 'new' delta when last month was zero", async () => {
		vi.spyOn(paymentService, "getInstructorEarnings").mockResolvedValue({
			availableCents: 0, owedCents: 0, lifetimeGrossCents: 5000, platformFeesCents: 1000,
		});
		vi.spyOn(paymentRepository, "getInstructorRevenueStats").mockResolvedValue({
			lifetimeGrossCents: 5000, thisMonthGrossCents: 5000, lastMonthGrossCents: 0,
		});

		const summary = await paymentService.getRevenueSummary("inst_1");
		expect(summary.thisMonth.delta).toEqual({ kind: "new" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit payment.service.test.ts`
Expected: FAIL — `getRevenueSummary is not a function`.

- [ ] **Step 3: Implement the method**

In `server/services/payments/payment.service.ts`, add these imports at the top:

```ts
import { computeDelta } from "@/lib/stats/computeDelta";
import { resolveRange } from "@/lib/stats/revenueRange";
import { courseRepository } from "@/server/repositories/course.repository";
import type {
	RevenueByCourseItem,
	RevenueRange,
	RevenueSummary,
	RevenueTimeSeriesPoint,
	RevenueTransaction,
	RevenueTransactionStatus,
} from "@/server/entities/payment/revenue";
import { eachDayOfInterval, eachMonthOfInterval, formatISO } from "date-fns";
```

Add this method to the `PaymentService` class:

```ts
	async getRevenueSummary(instructorId: string): Promise<RevenueSummary> {
		const [earnings, monthStats] = await Promise.all([
			this.getInstructorEarnings(instructorId),
			paymentRepository.getInstructorRevenueStats(instructorId),
		]);
		return {
			totalGrossCents: earnings.lifetimeGrossCents,
			paidOutCents: earnings.availableCents,
			pendingCents: earnings.owedCents,
			thisMonth: {
				grossCents: monthStats.thisMonthGrossCents,
				delta: computeDelta(
					monthStats.thisMonthGrossCents,
					monthStats.lastMonthGrossCents,
				),
			},
		};
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit payment.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/payments/payment.service.ts server/services/payments/payment.service.test.ts
git commit -m "feat(revenue): add getRevenueSummary service method"
```

---

## Task 7: Service — `getRevenueTimeSeries` (gap-filled)

Resolves the range, queries `getRevenueByBucket`, and fills empty buckets with zeros so the chart line is continuous. Periods are ISO date strings.

**Files:**
- Modify: `server/services/payments/payment.service.ts`
- Test: `server/services/payments/payment.service.test.ts`

- [ ] **Step 1: Write the failing unit test**

Append to `payment.service.test.ts`:

```ts
describe("paymentService.getRevenueTimeSeries", () => {
	it("gap-fills missing monthly buckets with zeros, ascending", async () => {
		vi.setSystemTime(new Date(2026, 5, 16)); // Jun 2026; 6m → Jan..Jun
		vi.spyOn(paymentRepository, "getRevenueByBucket").mockResolvedValue([
			{ period: new Date(2026, 2, 1), grossCents: 15000, netCents: 12000 }, // Mar only
		]);

		const series = await paymentService.getRevenueTimeSeries("inst_1", "6m");

		expect(series).toHaveLength(6); // Jan..Jun
		expect(series[0]).toEqual({
			period: series[0].period,
			grossCents: 0,
			netCents: 0,
		});
		const march = series.find((p) => p.period.startsWith("2026-03"));
		expect(march).toEqual({ period: march?.period, grossCents: 15000, netCents: 12000 });
		vi.useRealTimers();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit payment.service.test.ts`
Expected: FAIL — `getRevenueTimeSeries is not a function`.

- [ ] **Step 3: Implement the method**

Add to `PaymentService` (imports added in Task 6):

```ts
	async getRevenueTimeSeries(
		instructorId: string,
		range: RevenueRange,
	): Promise<RevenueTimeSeriesPoint[]> {
		const now = new Date();
		const { since, bucket } = resolveRange(range, now);
		const rows = await paymentRepository.getRevenueByBucket(
			instructorId,
			since,
			bucket,
		);

		// Build the full ordered list of bucket starts in [since, now].
		const starts =
			bucket === "day"
				? eachDayOfInterval({ start: since, end: now })
				: eachMonthOfInterval({ start: since, end: now });

		const keyOf = (d: Date) =>
			bucket === "day"
				? formatISO(d, { representation: "date" })
				: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

		const byKey = new Map(
			rows.map((r) => [keyOf(r.period), r] as const),
		);

		return starts.map((start) => {
			const hit = byKey.get(keyOf(start));
			return {
				period: formatISO(start, { representation: "date" }),
				grossCents: hit?.grossCents ?? 0,
				netCents: hit?.netCents ?? 0,
			};
		});
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit payment.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/payments/payment.service.ts server/services/payments/payment.service.test.ts
git commit -m "feat(revenue): add gap-filled getRevenueTimeSeries service method"
```

---

## Task 8: Service — `getRevenueByCourse`

Groups gross by course within the range and hydrates titles. Omits courses with no sales (the repo already returns only courses with payments).

**Files:**
- Modify: `server/services/payments/payment.service.ts`
- Test: `server/services/payments/payment.service.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
describe("paymentService.getRevenueByCourse", () => {
	it("hydrates titles and preserves repo ranking", async () => {
		vi.setSystemTime(new Date(2026, 5, 16));
		vi.spyOn(paymentRepository, "getRevenueGroupedByCourse").mockResolvedValue([
			{ courseId: "c2", grossCents: 8000 },
			{ courseId: "c1", grossCents: 3000 },
		]);
		vi.spyOn(courseRepository, "findMany").mockResolvedValue([
			{ id: "c1", title: "React" },
			{ id: "c2", title: "Web Dev" },
		] as never);

		const result = await paymentService.getRevenueByCourse("inst_1", "12m");
		expect(result).toEqual([
			{ courseId: "c2", title: "Web Dev", grossCents: 8000 },
			{ courseId: "c1", title: "React", grossCents: 3000 },
		]);
		vi.useRealTimers();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit payment.service.test.ts`
Expected: FAIL — `getRevenueByCourse is not a function`.

- [ ] **Step 3: Implement the method**

```ts
	async getRevenueByCourse(
		instructorId: string,
		range: RevenueRange,
	): Promise<RevenueByCourseItem[]> {
		const { since } = resolveRange(range);
		const grouped = await paymentRepository.getRevenueGroupedByCourse(
			instructorId,
			since,
			5,
		);
		if (grouped.length === 0) return [];

		const courses = await courseRepository.findMany({
			where: { id: { in: grouped.map((g) => g.courseId) } },
			select: { id: true, title: true },
		});
		const titleById = new Map(courses.map((c) => [c.id, c.title]));

		return grouped.map((g) => ({
			courseId: g.courseId,
			title: titleById.get(g.courseId) ?? "Untitled course",
			grossCents: g.grossCents,
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit payment.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/payments/payment.service.ts server/services/payments/payment.service.test.ts
git commit -m "feat(revenue): add getRevenueByCourse service method"
```

---

## Task 9: Service — `getRecentTransactions`

Bounded `findMany` with `course`/`student` relations, mapped to a flat DTO with status derived from the payment lifecycle.

**Files:**
- Modify: `server/services/payments/payment.service.ts`
- Test: `server/services/payments/payment.service.test.ts`

- [ ] **Step 1: Write the failing unit test**

```ts
describe("paymentService.getRecentTransactions", () => {
	it("maps payment rows to the transaction DTO with derived status", async () => {
		vi.spyOn(paymentRepository, "findMany").mockResolvedValue([
			{
				id: "p1", amountCents: 8900, status: "succeeded", refundedAt: null,
				createdAt: new Date(2026, 5, 14),
				course: { title: "Web Dev" }, student: { name: "Sarah Johnson" },
			},
			{
				id: "p2", amountCents: 6900, status: "succeeded",
				refundedAt: new Date(2026, 5, 11), createdAt: new Date(2026, 5, 10),
				course: { title: "TypeScript" }, student: { name: null },
			},
		] as never);

		const txns = await paymentService.getRecentTransactions("inst_1", 10);
		expect(txns[0]).toEqual({
			id: "p1", courseTitle: "Web Dev", studentName: "Sarah Johnson",
			createdAt: new Date(2026, 5, 14), amountCents: 8900, status: "completed",
		});
		expect(txns[1].status).toBe("refunded");
		expect(txns[1].studentName).toBe("Unknown");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit payment.service.test.ts`
Expected: FAIL — `getRecentTransactions is not a function`.

- [ ] **Step 3: Implement the method**

Add a private status mapper + the method to `PaymentService`:

```ts
	private toTransactionStatus(p: {
		status: string;
		refundedAt: Date | null;
	}): RevenueTransactionStatus {
		if (p.refundedAt) return "refunded";
		if (p.status === "succeeded") return "completed";
		if (p.status === "pending") return "pending";
		return "failed";
	}

	async getRecentTransactions(
		instructorId: string,
		limit: number,
	): Promise<RevenueTransaction[]> {
		const rows = await paymentRepository.findMany({
			where: { instructorId },
			orderBy: { createdAt: "desc" },
			take: limit,
			include: {
				course: { select: { title: true } },
				student: { select: { name: true } },
			},
		});
		return rows.map((p) => ({
			id: p.id,
			courseTitle: p.course?.title ?? "Untitled course",
			studentName: p.student?.name ?? "Unknown",
			createdAt: p.createdAt,
			amountCents: p.amountCents,
			status: this.toTransactionStatus(p),
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit payment.service.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add server/services/payments/payment.service.ts server/services/payments/payment.service.test.ts
git commit -m "feat(revenue): add getRecentTransactions service method"
```

---

## Task 10: Router — four `instructorProcedure` queries

**Files:**
- Modify: `server/api/routers/payment.ts`

- [ ] **Step 1: Add the imports**

At the top of `server/api/routers/payment.ts`, alongside the existing imports:

```ts
import {
	recentTransactionsInput,
	revenueRangeInput,
} from "@/server/entities/payment/revenue";
```

- [ ] **Step 2: Add the four queries**

Inside `createTRPCRouter({ … })`, in the "Instructor procedures" section (after `getInstructorEarnings`):

```ts
	getRevenueSummary: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await paymentService.getRevenueSummary(ctx.session.user.id);
		} catch (error) {
			throw handleServiceError(error);
		}
	}),

	getRevenueTimeSeries: instructorProcedure
		.input(revenueRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRevenueTimeSeries(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	getRevenueByCourse: instructorProcedure
		.input(revenueRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRevenueByCourse(
					ctx.session.user.id,
					input.range,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),

	getRecentTransactions: instructorProcedure
		.input(recentTransactionsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await paymentService.getRecentTransactions(
					ctx.session.user.id,
					input.limit,
				);
			} catch (error) {
				throw handleServiceError(error);
			}
		}),
```

- [ ] **Step 3: Verify type + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/payment.ts
git commit -m "feat(revenue): expose revenue queries on payment router"
```

---

## Task 11: Add recharts + `chart` UI primitive

**Files:**
- Modify: `package.json` (via install)
- Create: `app/_components/_shared/ui/chart.tsx`

- [ ] **Step 1: Install recharts**

Run: `pnpm add recharts`
Expected: `recharts` appears under `dependencies` in `package.json`.

- [ ] **Step 2: Create the chart primitive**

```tsx
// app/_components/_shared/ui/chart.tsx
"use client";

import type * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils/cn";

export type ChartConfig = {
	[k in string]: {
		label?: React.ReactNode;
		icon?: React.ComponentType;
		color?: string;
	};
};

type ChartContextProps = { config: ChartConfig };
import { createContext, useContext, useId, useMemo } from "react";

const ChartContext = createContext<ChartContextProps | null>(null);

function useChart() {
	const context = useContext(ChartContext);
	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}
	return context;
}

function ChartContainer({
	id,
	className,
	children,
	config,
	...props
}: React.ComponentProps<"div"> & {
	config: ChartConfig;
	children: React.ComponentProps<
		typeof RechartsPrimitive.ResponsiveContainer
	>["children"];
}) {
	const uniqueId = useId();
	const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;
	const style = useMemo(() => {
		const colorVars = Object.entries(config)
			.filter(([, v]) => v.color)
			.map(([key, v]) => `--color-${key}: ${v.color};`)
			.join(" ");
		return colorVars;
	}, [config]);

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				data-chart={chartId}
				className={cn(
					"flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
					className,
				)}
				{...props}
			>
				<style dangerouslySetInnerHTML={{ __html: `[data-chart=${chartId}]{${style}}` }} />
				<RechartsPrimitive.ResponsiveContainer>
					{children}
				</RechartsPrimitive.ResponsiveContainer>
			</div>
		</ChartContext.Provider>
	);
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
	active,
	payload,
	label,
	labelFormatter,
	formatter,
	className,
}: {
	active?: boolean;
	payload?: Array<{ name?: string; value?: number; dataKey?: string; color?: string }>;
	label?: string;
	labelFormatter?: (label: string) => React.ReactNode;
	formatter?: (value: number, name?: string) => React.ReactNode;
	className?: string;
}) {
	const { config } = useChart();
	if (!active || !payload?.length) return null;

	return (
		<div
			className={cn(
				"grid min-w-[8rem] gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md",
				className,
			)}
		>
			{label && (
				<div className="font-medium">
					{labelFormatter ? labelFormatter(label) : label}
				</div>
			)}
			{payload.map((item) => {
				const key = item.dataKey ?? item.name ?? "value";
				const itemConfig = config[key];
				return (
					<div key={key} className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<span
								className="h-2 w-2 rounded-[2px]"
								style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
							/>
							{itemConfig?.label ?? item.name}
						</span>
						<span className="font-mono font-medium tabular-nums">
							{formatter && typeof item.value === "number"
								? formatter(item.value, item.name)
								: item.value}
						</span>
					</div>
				);
			})}
		</div>
	);
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, useChart };
```

- [ ] **Step 3: Verify type + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml app/_components/_shared/ui/chart.tsx
git commit -m "feat(revenue): add recharts and chart UI primitive"
```

---

## Task 12: `table` UI primitive

**Files:**
- Create: `app/_components/_shared/ui/table.tsx`

- [ ] **Step 1: Create the table primitive**

```tsx
// app/_components/_shared/ui/table.tsx
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div className="relative w-full overflow-x-auto">
			<table className={cn("w-full caption-bottom text-sm", className)} {...props} />
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			className={cn(
				"border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			className={cn(
				"h-10 px-2 text-left align-middle font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return <td className={cn("p-2 align-middle", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 2: Verify type + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/_components/_shared/ui/table.tsx
git commit -m "feat(revenue): add table UI primitive"
```

---

## Task 13: RSC fetch helper for the dashboard chart

**Files:**
- Create: `lib/requests/instructor/getRevenueTimeSeries.ts`

- [ ] **Step 1: Create the helper**

```ts
// lib/requests/instructor/getRevenueTimeSeries.ts
import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

/** Default-range (last 12 months) revenue series for the dashboard chart.
 *  Degrades to an empty series on failure, mirroring getDashboardStats. */
const getRevenueTimeSeries = async (): Promise<RevenueTimeSeriesPoint[]> => {
	try {
		return await api.payment.getRevenueTimeSeries({ range: "12m" });
	} catch (error) {
		console.error("Error fetching instructor revenue series:", error);
		return [];
	}
};

export default getRevenueTimeSeries;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/requests/instructor/getRevenueTimeSeries.ts
git commit -m "feat(revenue): add RSC revenue-series fetch helper"
```

---

## Task 14: Dashboard revenue chart island

**Files:**
- Create: `app/_components/Instructor/DashboardRevenueChart/types.ts`
- Create: `app/_components/Instructor/DashboardRevenueChart/index.tsx`

- [ ] **Step 1: Create the prop types**

```ts
// app/_components/Instructor/DashboardRevenueChart/types.ts
import type { RevenueTimeSeriesPoint } from "@/server/entities/payment/revenue";

export type DashboardRevenueChartProps = {
	data: RevenueTimeSeriesPoint[];
};
```

- [ ] **Step 2: Create the component**

```tsx
// app/_components/Instructor/DashboardRevenueChart/index.tsx
"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { DashboardRevenueChartProps } from "./types";

const config = { grossCents: { label: "Revenue", color: "var(--chart-1)" } };

export default function DashboardRevenueChart({
	data,
}: DashboardRevenueChartProps) {
	const hasData = data.some((p) => p.grossCents > 0);

	if (!hasData) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
				<p className="text-muted-foreground text-sm">No revenue yet</p>
			</div>
		);
	}

	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data} margin={{ left: 4, right: 4 }}>
				<defs>
					<linearGradient id="fillDashRevenue" x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor="var(--color-grossCents)" stopOpacity={0.8} />
						<stop offset="95%" stopColor="var(--color-grossCents)" stopOpacity={0.1} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					axisLine={false}
					dataKey="period"
					tickFormatter={(v: string) => format(parseISO(v), "MMM")}
					tickLine={false}
					tickMargin={8}
				/>
				<YAxis
					axisLine={false}
					tickFormatter={(v: number) => formatUsd(v)}
					tickLine={false}
					tickMargin={8}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) => formatUsd(value)}
							labelFormatter={(l) => format(parseISO(l), "MMM yyyy")}
						/>
					}
					cursor={false}
				/>
				<Area
					dataKey="grossCents"
					fill="url(#fillDashRevenue)"
					stroke="var(--color-grossCents)"
					strokeWidth={2}
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
```

- [ ] **Step 3: Verify type + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/DashboardRevenueChart
git commit -m "feat(revenue): add dashboard revenue chart island"
```

---

## Task 15: Wire the chart into the dashboard page (FR12, FR13)

**Files:**
- Modify: `app/instructor/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/instructor/page.tsx`, add:

```ts
import DashboardRevenueChart from "@/app/_components/Instructor/DashboardRevenueChart";
import getRevenueTimeSeries from "@/lib/requests/instructor/getRevenueTimeSeries";
```

- [ ] **Step 2: Fetch the series in the Server Component**

In the `DashboardPage` function body, alongside the existing `const stats = await getDashboardStats();`, add:

```ts
	const revenueSeries = await getRevenueTimeSeries();
```

- [ ] **Step 3: Replace the placeholder**

Find the "Revenue Chart Placeholder" block (the `<div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">…</div>` inside the "Revenue Overview" `<Card>`) and replace that inner placeholder `<div>` with:

```tsx
					<DashboardRevenueChart data={revenueSeries} />
```

Leave the surrounding `<Card>`, the "Revenue Overview" heading, and the existing "View Details" link to `/instructor/revenue` unchanged (FR13).

- [ ] **Step 4: Verify type + lint + build**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/instructor/page.tsx
git commit -m "feat(revenue): render real revenue chart on instructor dashboard"
```

---

## Task 16: Revenue page sub-components

Builds the helpers, prop types, and six sub-components. No automated component tests (no RTL harness in this repo); verified by typecheck/lint here and the manual scenarios in `validation.md`.

**Files:**
- Create: `app/_components/Instructor/Revenue/helpers.ts`
- Create: `app/_components/Instructor/Revenue/types.ts`
- Create: `app/_components/Instructor/Revenue/components/RevenueSummaryCards.tsx`
- Create: `app/_components/Instructor/Revenue/components/RevenuePayouts.tsx`
- Create: `app/_components/Instructor/Revenue/components/RevenueRangeSelect.tsx`
- Create: `app/_components/Instructor/Revenue/components/RevenueOverTimeChart.tsx`
- Create: `app/_components/Instructor/Revenue/components/RevenueByCourseChart.tsx`
- Create: `app/_components/Instructor/Revenue/components/RevenueTransactionsTable.tsx`

- [ ] **Step 1: Helpers**

```ts
// app/_components/Instructor/Revenue/helpers.ts
import type { RevenueRange, RevenueTransactionStatus } from "@/server/entities/payment/revenue";

export const RANGE_OPTIONS: { value: RevenueRange; label: string }[] = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "12m", label: "Last 12 months" },
];

export const STATUS_LABEL: Record<RevenueTransactionStatus, string> = {
	completed: "Completed",
	pending: "Pending",
	refunded: "Refunded",
	failed: "Failed",
};

export const STATUS_CLASS: Record<RevenueTransactionStatus, string> = {
	completed: "bg-green-500/10 text-green-600 hover:bg-green-500/10",
	pending: "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/10",
	refunded: "bg-red-500/10 text-red-600 hover:bg-red-500/10",
	failed: "bg-muted text-muted-foreground hover:bg-muted",
};
```

- [ ] **Step 2: Prop types**

```ts
// app/_components/Instructor/Revenue/types.ts
import type {
	RevenueByCourseItem,
	RevenueRange,
	RevenueSummary,
	RevenueTimeSeriesPoint,
	RevenueTransaction,
} from "@/server/entities/payment/revenue";
import type { StatDelta } from "@/server/entities/instructor/dashboard";

export type RevenueSummaryCardsProps = { summary: RevenueSummary | undefined; isLoading: boolean };
export type StatCardProps = {
	label: string;
	value: string;
	icon: React.ReactNode;
	iconWrapperClassName: string;
	subline?: React.ReactNode;
};
export type DeltaBadgeProps = { delta: StatDelta };

export type RevenuePayoutsProps = { paidOutCents: number; pendingCents: number };

export type RevenueRangeSelectProps = {
	value: RevenueRange;
	onChange: (range: RevenueRange) => void;
};

export type RevenueOverTimeChartProps = {
	data: RevenueTimeSeriesPoint[] | undefined;
	isLoading: boolean;
};
export type RevenueByCourseChartProps = {
	data: RevenueByCourseItem[] | undefined;
	isLoading: boolean;
};
export type RevenueTransactionsTableProps = {
	transactions: RevenueTransaction[] | undefined;
	isLoading: boolean;
};
```

- [ ] **Step 3: Summary cards (FR1–FR4)**

```tsx
// app/_components/Instructor/Revenue/components/RevenueSummaryCards.tsx
import { ArrowDownRight, ArrowUpRight, Clock, DollarSign, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import type { DeltaBadgeProps, RevenueSummaryCardsProps, StatCardProps } from "../types";

function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new") {
		return (
			<div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
				<ArrowUpRight className="h-4 w-4" />
				<span>New this month</span>
			</div>
		);
	}
	if (delta.direction === "flat") {
		return <p className="mt-2 text-muted-foreground text-sm">No change from last month</p>;
	}
	const isUp = delta.direction === "up";
	const Icon = isUp ? ArrowUpRight : ArrowDownRight;
	return (
		<div className={`mt-2 flex items-center gap-1 text-sm ${isUp ? "text-green-600" : "text-red-600"}`}>
			<Icon className="h-4 w-4" />
			<span>{Math.abs(delta.value)}% from last month</span>
		</div>
	);
}

function StatCard({ label, value, icon, iconWrapperClassName, subline }: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
					{subline}
				</div>
				<div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrapperClassName}`}>
					{icon}
				</div>
			</div>
		</Card>
	);
}

export default function RevenueSummaryCards({ summary, isLoading }: RevenueSummaryCardsProps) {
	const s = summary;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<DollarSign className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Total Revenue"
				value={isLoading || !s ? "—" : formatUsd(s.totalGrossCents)}
			/>
			<StatCard
				icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="This Month"
				subline={s ? <DeltaBadge delta={s.thisMonth.delta} /> : null}
				value={isLoading || !s ? "—" : formatUsd(s.thisMonth.grossCents)}
			/>
			<StatCard
				icon={<Wallet className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Paid Out"
				value={isLoading || !s ? "—" : formatUsd(s.paidOutCents)}
			/>
			<StatCard
				icon={<Clock className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Pending Payout"
				value={isLoading || !s ? "—" : formatUsd(s.pendingCents)}
			/>
		</div>
	);
}
```

- [ ] **Step 4: Payouts banner (FR5/FR6) — reuses the existing Connect button**

```tsx
// app/_components/Instructor/Revenue/components/RevenuePayouts.tsx
"use client";

import { Card } from "@/app/_components/_shared/ui/card";
import { PayoutsActionButton } from "@/app/_components/Account/PayoutsSection/components/PayoutsActionButton";
import { formatUsd } from "@/lib/formatUsd";
import { api } from "@/trpc/client";
import type { RevenuePayoutsProps } from "../types";

export default function RevenuePayouts({ paidOutCents, pendingCents }: RevenuePayoutsProps) {
	const { data: connect } = api.payment.getConnectStatus.useQuery();

	return (
		<Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex gap-10">
				<div>
					<p className="text-muted-foreground text-sm">Paid out</p>
					<p className="mt-1 font-bold text-2xl text-green-600">{formatUsd(paidOutCents)}</p>
				</div>
				<div>
					<p className="text-muted-foreground text-sm">Pending payout</p>
					<p className="mt-1 font-bold text-2xl">{formatUsd(pendingCents)}</p>
				</div>
			</div>
			<div className="flex flex-col items-start gap-2 sm:items-end">
				<p className="text-muted-foreground text-sm">
					Payouts are sent automatically to your connected account.
				</p>
				{connect?.status !== undefined && <PayoutsActionButton status={connect.status} />}
			</div>
		</Card>
	);
}
```

- [ ] **Step 5: Range selector (FR11)**

```tsx
// app/_components/Instructor/Revenue/components/RevenueRangeSelect.tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import type { RevenueRange } from "@/server/entities/payment/revenue";
import { RANGE_OPTIONS } from "../helpers";
import type { RevenueRangeSelectProps } from "../types";

export default function RevenueRangeSelect({ value, onChange }: RevenueRangeSelectProps) {
	return (
		<Select onValueChange={(v) => onChange(v as RevenueRange)} value={value}>
			<SelectTrigger className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{RANGE_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 6: Revenue-over-time chart (FR7)**

```tsx
// app/_components/Instructor/Revenue/components/RevenueOverTimeChart.tsx
"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { RevenueOverTimeChartProps } from "../types";

const config = {
	grossCents: { label: "Revenue", color: "var(--chart-1)" },
	netCents: { label: "Net Payout", color: "var(--chart-2)" },
};

export default function RevenueOverTimeChart({ data, isLoading }: RevenueOverTimeChartProps) {
	const hasData = !!data && data.some((p) => p.grossCents > 0);
	return (
		<Card className="p-6 lg:col-span-2">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Revenue &amp; Payouts</h2>
				<p className="text-muted-foreground text-sm">Gross revenue vs. net payout over time</p>
			</div>
			{isLoading && <div className="h-[300px] animate-pulse rounded-lg bg-muted" />}
			{!isLoading && !hasData && (
				<div className="flex h-[300px] items-center justify-center rounded-lg border-2 border-dashed">
					<p className="text-muted-foreground text-sm">No sales in this range</p>
				</div>
			)}
			{!isLoading && hasData && (
				<ChartContainer className="h-[300px] w-full" config={config}>
					<AreaChart data={data} margin={{ left: 4, right: 4 }}>
						<defs>
							<linearGradient id="fillGross" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="var(--color-grossCents)" stopOpacity={0.8} />
								<stop offset="95%" stopColor="var(--color-grossCents)" stopOpacity={0.1} />
							</linearGradient>
							<linearGradient id="fillNet" x1="0" y1="0" x2="0" y2="1">
								<stop offset="5%" stopColor="var(--color-netCents)" stopOpacity={0.8} />
								<stop offset="95%" stopColor="var(--color-netCents)" stopOpacity={0.1} />
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="period"
							tickFormatter={(v: string) => format(parseISO(v), "MMM")}
							tickLine={false}
							tickMargin={8}
						/>
						<YAxis
							axisLine={false}
							tickFormatter={(v: number) => formatUsd(v)}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									formatter={(value) => formatUsd(value)}
									labelFormatter={(l) => format(parseISO(l), "MMM d, yyyy")}
								/>
							}
							cursor={false}
						/>
						<Area dataKey="grossCents" fill="url(#fillGross)" stroke="var(--color-grossCents)" strokeWidth={2} type="monotone" />
						<Area dataKey="netCents" fill="url(#fillNet)" stroke="var(--color-netCents)" strokeWidth={2} type="monotone" />
					</AreaChart>
				</ChartContainer>
			)}
		</Card>
	);
}
```

- [ ] **Step 7: Revenue-by-course chart (FR8)**

```tsx
// app/_components/Instructor/Revenue/components/RevenueByCourseChart.tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { RevenueByCourseChartProps } from "../types";

const config = { grossCents: { label: "Revenue", color: "var(--chart-1)" } };

export default function RevenueByCourseChart({ data, isLoading }: RevenueByCourseChartProps) {
	const hasData = !!data && data.length > 0;
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Revenue by Course</h2>
				<p className="text-muted-foreground text-sm">Top earners in range</p>
			</div>
			{isLoading && <div className="h-[300px] animate-pulse rounded-lg bg-muted" />}
			{!isLoading && !hasData && (
				<div className="flex h-[300px] items-center justify-center rounded-lg border-2 border-dashed">
					<p className="text-muted-foreground text-sm">No sales in this range</p>
				</div>
			)}
			{!isLoading && hasData && (
				<ChartContainer className="h-[300px] w-full" config={config}>
					<BarChart data={data} layout="vertical" margin={{ left: 4, right: 12 }}>
						<CartesianGrid horizontal={false} />
						<XAxis hide type="number" />
						<YAxis
							axisLine={false}
							dataKey="title"
							tickLine={false}
							tickMargin={8}
							type="category"
							width={90}
						/>
						<ChartTooltip
							content={<ChartTooltipContent formatter={(value) => formatUsd(value)} />}
							cursor={false}
						/>
						<Bar dataKey="grossCents" fill="var(--color-grossCents)" radius={[0, 4, 4, 0]} />
					</BarChart>
				</ChartContainer>
			)}
		</Card>
	);
}
```

- [ ] **Step 8: Transactions table (FR10)**

```tsx
// app/_components/Instructor/Revenue/components/RevenueTransactionsTable.tsx
"use client";

import { format } from "date-fns";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/_components/_shared/ui/table";
import { formatUsd } from "@/lib/formatUsd";
import { STATUS_CLASS, STATUS_LABEL } from "../helpers";
import type { RevenueTransactionsTableProps } from "../types";

export default function RevenueTransactionsTable({
	transactions,
	isLoading,
}: RevenueTransactionsTableProps) {
	const hasRows = !!transactions && transactions.length > 0;
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Recent Transactions</h2>
				<p className="text-muted-foreground text-sm">Your latest course sales</p>
			</div>
			{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
			{!isLoading && !hasRows && (
				<p className="text-muted-foreground text-sm">No sales yet.</p>
			)}
			{!isLoading && hasRows && (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Course</TableHead>
							<TableHead>Student</TableHead>
							<TableHead>Date</TableHead>
							<TableHead className="text-right">Amount</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{transactions.map((txn) => (
							<TableRow key={txn.id}>
								<TableCell className="font-medium">{txn.courseTitle}</TableCell>
								<TableCell>{txn.studentName}</TableCell>
								<TableCell className="text-muted-foreground">
									{format(txn.createdAt, "MMM d, yyyy")}
								</TableCell>
								<TableCell className="text-right font-semibold">
									{formatUsd(txn.amountCents)}
								</TableCell>
								<TableCell className="text-right">
									<Badge className={STATUS_CLASS[txn.status]} variant="secondary">
										{STATUS_LABEL[txn.status]}
									</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Card>
	);
}
```

- [ ] **Step 9: Verify type + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/_components/Instructor/Revenue
git commit -m "feat(revenue): add revenue page sub-components"
```

---

## Task 17: `RevenueOverview` orchestrator + page route

**Files:**
- Create: `app/_components/Instructor/Revenue/index.tsx`
- Modify: `app/instructor/revenue/page.tsx`

- [ ] **Step 1: Create the orchestrator**

```tsx
// app/_components/Instructor/Revenue/index.tsx
"use client";

import { useState } from "react";
import type { RevenueRange } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/client";
import RevenueByCourseChart from "./components/RevenueByCourseChart";
import RevenueOverTimeChart from "./components/RevenueOverTimeChart";
import RevenuePayouts from "./components/RevenuePayouts";
import RevenueRangeSelect from "./components/RevenueRangeSelect";
import RevenueSummaryCards from "./components/RevenueSummaryCards";
import RevenueTransactionsTable from "./components/RevenueTransactionsTable";

export default function RevenueOverview() {
	const [range, setRange] = useState<RevenueRange>("12m");

	const summary = api.payment.getRevenueSummary.useQuery();
	const series = api.payment.getRevenueTimeSeries.useQuery({ range });
	const byCourse = api.payment.getRevenueByCourse.useQuery({ range });
	const transactions = api.payment.getRecentTransactions.useQuery({ limit: 10 });

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-3xl">Revenue</h1>
					<p className="text-muted-foreground">
						Track your earnings, payouts, and transactions.
					</p>
				</div>
				<RevenueRangeSelect onChange={setRange} value={range} />
			</div>

			<RevenueSummaryCards isLoading={summary.isLoading} summary={summary.data} />

			<RevenuePayouts
				paidOutCents={summary.data?.paidOutCents ?? 0}
				pendingCents={summary.data?.pendingCents ?? 0}
			/>

			<div className="grid gap-6 lg:grid-cols-3">
				<RevenueOverTimeChart data={series.data} isLoading={series.isLoading} />
				<RevenueByCourseChart data={byCourse.data} isLoading={byCourse.isLoading} />
			</div>

			<RevenueTransactionsTable
				isLoading={transactions.isLoading}
				transactions={transactions.data}
			/>
		</div>
	);
}
```

- [ ] **Step 2: Rewrite the page route**

Replace the entire contents of `app/instructor/revenue/page.tsx` with:

```tsx
// app/instructor/revenue/page.tsx
import RevenueOverview from "@/app/_components/Instructor/Revenue";

export default function RevenuePage() {
	return <RevenueOverview />;
}
```

- [ ] **Step 3: Verify type + lint + build**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: PASS — the route compiles as a real default-export page.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/Revenue/index.tsx app/instructor/revenue/page.tsx
git commit -m "feat(revenue): wire revenue page route to RevenueOverview"
```

---

## Task 18: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Unit + integration tests**

Run: `pnpm test`
Expected: PASS — all new unit tests (formatUsd, revenueRange, payment.service) and integration tests (payment.repository) green, plus the existing suite.

- [ ] **Step 2: Type + lint + build**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: PASS, no warnings about the removed mock imports (`@/components/ui/*`, stray `recharts` usage).

- [ ] **Step 3: Manual smoke (see `validation.md`)**

Run: `pnpm dev`, sign in as an instructor with sales, visit `/instructor` (real chart, no dashed placeholder) and `/instructor/revenue` (cards reconcile with the dashboard Total Revenue; charts respond to the range selector; transactions list renders; "Manage payouts" opens onboarding or the Stripe dashboard). Confirm a fresh instructor with no sales sees `$0` cards and empty states without errors.

- [ ] **Step 4: Final commit (if any lint autofixes applied)**

```bash
git add -A
git commit -m "chore(revenue): verification pass" --allow-empty
```

---

## Self-Review notes

- **Spec coverage:** FR1–FR4 → Task 6 + Task 16(step 3); FR5/FR6 → Task 16(step 4, reuses `PayoutsActionButton`); FR7 → Tasks 4,7,16(step 6); FR8 → Tasks 5,8,16(step 7); FR9 → reconciliation asserted in Task 4 test + Task 18; FR10 → Tasks 9,16(step 8); FR11 → Task 16(step 5)+Task 17; FR12/FR13 → Tasks 13,14,15; FR14/FR15 → Task 10 (`instructorProcedure`, session id). All four page sections + dashboard chart covered.
- **Types:** `RevenueRange`, `RevenueSummary`, `RevenueTimeSeriesPoint`, `RevenueByCourseItem`, `RevenueTransaction(+Status)` defined once in Task 3 and reused verbatim downstream. `formatUsd` (Task 1) and `resolveRange` (Task 2) are the only new shared helpers. Method names (`getRevenueByBucket`, `getRevenueGroupedByCourse`, `getRevenueSummary`, `getRevenueTimeSeries`, `getRevenueByCourse`, `getRecentTransactions`) are consistent across repo/service/router tasks.
- **Ordering caveat:** Task 2 imports a type from Task 3 — land Task 3's entities file before running Task 2's typecheck (noted inline).