# Instructor Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`requirements.md`](./requirements.md) for FRs,
> [`spec.md`](./spec.md) for design, [`validation.md`](./validation.md) for checks.

**Goal:** Ship a real-data instructor analytics feature — a global `/instructor/analytics` page
(replacing the v0 scaffold) and a per-course `/instructor/courses/[courseId]/analytics` page (fixing
the card's 404) — with every metric aggregated from existing tables and zero mock data.

**Architecture:** Mirror the Revenue feature end-to-end: a new `analytics` router
(`instructorProcedure`) → `AnalyticsService` (+ `.errors.ts`) → a dedicated `AnalyticsRepository`
(`date_trunc` raw SQL + Prisma `groupBy`). Range-less summary cards are RSC-fetched via request
helpers; range-driven charts are client components using tRPC `useQuery({ range })`. Reuse
`resolveRange`, `computeDelta`, `getMonthWindows`, `StatDelta`, and the `TopPerformingCourses`
widget; extract the existing `StatCard`/`DeltaBadge` and a generic `RangeSelect` into a shared
location so Revenue and Analytics share one implementation.

**Tech Stack:** Next.js 16 App Router (RSC), tRPC, Prisma, Zod, Vitest, Tailwind + shared Radix UI
primitives, recharts, `date-fns`.

**Codebase anchors (verified during planning):**
- `resolveRange` (`lib/stats/revenueRange.ts:8`) — `(range, now) → { since, bucket: "day"|"month" }`.
  Reused as-is (retyped to `StatsRange`).
- `computeDelta` (`lib/stats/computeDelta.ts:4`) — `(current, previous) → StatDelta`; handles 0/0.
- `getMonthWindows` (`lib/stats/monthWindows.ts:11`) — `{ startThisMonth, startLastMonth, startNextMonth }`.
- `StatDelta` (`lib/stats/statDelta.ts`) — `{kind:"percent"|"new"|"none"}`; `DeltaBadge` renders nothing for `none`.
- Payment time-series + zero-fill pattern (`server/services/payments/payment.service.ts:262-294`) —
  `eachMonthOfInterval`/`eachDayOfInterval` + keyed `Map` fill. Funnel/trend mirrors this.
- `paymentRepository.getRevenueByBucket` (`server/repositories/payment.repository.ts:93`) — `date_trunc(${bucket}, created_at)` raw-SQL shape to mirror.
- `paymentRepository.getRevenueGroupedByCourse` (`:120`) — Prisma `groupBy` shape to mirror.
- `courseRepository.getOwnCourse(courseId, instructorId)` (`server/repositories/course.repository.ts:205`) —
  returns the course (with ordered sections→lessons) or `null` if not owned. Used for ownership + funnel ordering.
- `instructorService` / `instructorRouter` patterns (`server/services/instructor/instructor.service.ts:99`,
  `server/api/routers/instructor.ts`) — `logger.info`, `Promise.all`, `instructorProcedure` + `try/catch` + `handleServiceError`.
- `handleServiceError` (`server/utils/handleServiceError.ts`) + `DomainError` (`server/services/base/base.errors.ts`).
- `getDashboardStats` request helper (`lib/requests/instructor/getDashboardStats.ts`) — try/catch + empty fallback, calls `api.*` from `@/trpc/server`.
- `StatCard`/`DeltaBadge` (`app/_components/Instructor/Revenue/components/RevenueSummaryCards/components/`) — to extract.
- `RevenueRangeSelect` (`.../RevenueRangeSelect/`) + `RANGE_OPTIONS` (`Revenue/constants/rangeOptions.ts`) — to generalise.
- `DashboardRevenueChart` (`app/_components/Instructor/DashboardRevenueChart/index.tsx`) — recharts AreaChart + `ChartContainer` pattern to copy.
- `TopPerformingCourses` (`app/_components/Instructor/TopPerformingCourses/`) + `getTopPerformingCourses` helper — reused on the global page.
- `PageShell` (`app/_components/_shared/components/PageShell`) — renders the `<h1>`; pages must NOT render their own heading.
- Shared UI primitives in `app/_components/_shared/ui/`: `card`, `badge`, `progress`, `select`, `chart`, `button`.
- Test harness: `test/db` (`testDb`), `test/factories` (`makeUser`, `makeCourse`, `makeSection`, `makeLesson`, `makeEnrollment`, `makeLessonProgress`); quizzes via `testDb.quiz`/`testDb.quizAttempt` directly.

**Per-task conventions:** After each implementation step, `pnpm typecheck` + `pnpm check` must be
clean before committing. Unit tests are colocated `*.test.ts` (no DB); repository/service tests are
`*.integration.test.ts` (real `learnix_test`). Run unit with `pnpm test:unit <path>`, integration
with `pnpm test:integration <path>`. Services and repositories export singletons. Every component
folder has a colocated `types.ts`; no inline prop types; no nested ternaries in JSX.

**DTO refinement note (honesty over fabrication):** FR2/FR10 ask for a delta on each summary card.
Three of four metrics are genuinely time-windowed (enrollments, active learners, quiz pass rate) and
get real MoM deltas. **Avg Progress %** is a current snapshot — the schema stores no progress
history — so its delta is always `{kind:"none"}` and `DeltaBadge` renders nothing. This honours
scope decision #1 (no fabricated data). Documented in `validation.md`.

---

## Task 1: Shared stats range entity

**Files:**
- Create: `server/entities/stats/range.ts`
- Modify: `server/entities/payment/revenue.ts:4-9` (replace local enum with re-export)
- Modify: `lib/stats/revenueRange.ts:2` (import `StatsRange`)
- Modify: `app/_components/Instructor/Revenue/constants/rangeOptions.ts` (re-export shared options)

**Interfaces:**
- Produces: `statsRangeSchema`, `type StatsRange`, `statsRangeInput`, `STATS_RANGE_OPTIONS` from `@/server/entities/stats/range`.

- [ ] **Step 1: Create the shared range entity**

```ts
// server/entities/stats/range.ts
import { z } from "zod";

export const statsRangeSchema = z.enum(["30d", "6m", "12m"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

export const statsRangeInput = z.object({ range: statsRangeSchema });

export const STATS_RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "12m", label: "Last 12 months" },
];
```

- [ ] **Step 2: Re-export from payment revenue entity (keep existing names working)**

Replace lines 1-9 of `server/entities/payment/revenue.ts` (the `import { z }`, `revenueRangeSchema`,
`RevenueRange`, `revenueRangeInput` declarations) with:

```ts
import type { StatDelta } from "@/server/entities/instructor/dashboard";
import {
	type StatsRange,
	statsRangeInput,
	statsRangeSchema,
} from "@/server/entities/stats/range";

export const revenueRangeSchema = statsRangeSchema;
export type RevenueRange = StatsRange;
export const revenueRangeInput = statsRangeInput;
```

(Leave the rest of the file — `RevenueSummary`, `RevenueTimeSeriesPoint`, etc. — unchanged.)

- [ ] **Step 3: Retype `resolveRange`**

In `lib/stats/revenueRange.ts` change the import on line 2 from
`import type { RevenueRange } from "@/server/entities/payment/revenue";` to:

```ts
import type { StatsRange } from "@/server/entities/stats/range";
```

and change the parameter type `range: RevenueRange` → `range: StatsRange` (and the `ResolvedRange`
stays the same). Behaviour is unchanged.

- [ ] **Step 4: Repoint Revenue's RANGE_OPTIONS**

Replace the body of `app/_components/Instructor/Revenue/constants/rangeOptions.ts` with:

```ts
export { STATS_RANGE_OPTIONS as RANGE_OPTIONS } from "@/server/entities/stats/range";
```

- [ ] **Step 5: Verify nothing broke**

Run: `pnpm typecheck`
Expected: clean (all existing `RevenueRange`/`revenueRangeInput`/`RANGE_OPTIONS` consumers still resolve).

- [ ] **Step 6: Commit**

```bash
git add server/entities/stats/range.ts server/entities/payment/revenue.ts lib/stats/revenueRange.ts app/_components/Instructor/Revenue/constants/rangeOptions.ts
git commit -m "refactor(stats): extract shared stats range entity"
```

---

## Task 2: Extract shared StatCard, DeltaBadge, RangeSelect

**Files:**
- Create: `app/_components/Instructor/_shared/StatCard/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/_shared/DeltaBadge/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/_shared/RangeSelect/{index.tsx,types.ts}`
- Modify: `app/_components/Instructor/Revenue/components/RevenueSummaryCards/index.tsx` (import shared)
- Modify: `app/_components/Instructor/Revenue/components/RevenueCharts/index.tsx` (use shared RangeSelect)
- Delete: the old `RevenueSummaryCards/components/StatCard`, `.../DeltaBadge`, and `RevenueRangeSelect` folders

**Interfaces:**
- Produces: default exports `StatCard` (`StatCardProps`), `DeltaBadge` (`DeltaBadgeProps`), `RangeSelect` (`RangeSelectProps`) from `@/app/_components/Instructor/_shared/*`.

- [ ] **Step 1: Create shared StatCard**

```tsx
// app/_components/Instructor/_shared/StatCard/index.tsx
import { Card } from "@/app/_components/_shared/ui/card";
import type { StatCardProps } from "./types";

export default function StatCard({
	label,
	value,
	icon,
	iconWrapperClassName,
	subline,
}: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
					{subline}
				</div>
				<div
					className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrapperClassName}`}
				>
					{icon}
				</div>
			</div>
		</Card>
	);
}
```

```ts
// app/_components/Instructor/_shared/StatCard/types.ts
import type * as React from "react";

export type StatCardProps = {
	label: string;
	value: string;
	icon: React.ReactNode;
	iconWrapperClassName: string;
	subline?: React.ReactNode;
};
```

- [ ] **Step 2: Create shared DeltaBadge** (copy verbatim from the existing file)

```tsx
// app/_components/Instructor/_shared/DeltaBadge/index.tsx
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { DeltaBadgeProps } from "./types";

export default function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new") {
		return (
			<div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
				<ArrowUpRight className="h-4 w-4" />
				<span>New this month</span>
			</div>
		);
	}
	if (delta.kind === "percent") {
		if (delta.value === -100) {
			return (
				<div className="mt-2 flex items-center gap-1 text-red-600 text-sm">
					<ArrowDownRight className="h-4 w-4" />
					<span>None this month</span>
				</div>
			);
		}
		if (delta.direction === "flat") {
			return (
				<p className="mt-2 text-muted-foreground text-sm">
					No change from last month
				</p>
			);
		}
		const isUp = delta.direction === "up";
		const Icon = isUp ? ArrowUpRight : ArrowDownRight;
		return (
			<div
				className={`mt-2 flex items-center gap-1 text-sm ${isUp ? "text-green-600" : "text-red-600"}`}
			>
				<Icon className="h-4 w-4" />
				<span>{Math.abs(delta.value)}% from last month</span>
			</div>
		);
	}
	return null;
}
```

```ts
// app/_components/Instructor/_shared/DeltaBadge/types.ts
import type { StatDelta } from "@/server/entities/instructor/dashboard";

export type DeltaBadgeProps = { delta: StatDelta };
```

- [ ] **Step 3: Create generic RangeSelect**

```tsx
// app/_components/Instructor/_shared/RangeSelect/index.tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { STATS_RANGE_OPTIONS } from "@/server/entities/stats/range";
import type { StatsRange } from "@/server/entities/stats/range";
import type { RangeSelectProps } from "./types";

export default function RangeSelect({ value, onChange }: RangeSelectProps) {
	return (
		<Select onValueChange={(v) => onChange(v as StatsRange)} value={value}>
			<SelectTrigger className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{STATS_RANGE_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

```ts
// app/_components/Instructor/_shared/RangeSelect/types.ts
import type { StatsRange } from "@/server/entities/stats/range";

export type RangeSelectProps = {
	value: StatsRange;
	onChange: (range: StatsRange) => void;
};
```

- [ ] **Step 4: Repoint Revenue summary cards**

In `app/_components/Instructor/Revenue/components/RevenueSummaryCards/index.tsx`, change the two
local imports:

```ts
import DeltaBadge from "@/app/_components/Instructor/_shared/DeltaBadge";
import StatCard from "@/app/_components/Instructor/_shared/StatCard";
```

(replacing `import DeltaBadge from "./components/DeltaBadge";` and `import StatCard from "./components/StatCard";`).

- [ ] **Step 5: Repoint Revenue charts to shared RangeSelect**

In `app/_components/Instructor/Revenue/components/RevenueCharts/index.tsx`, replace
`import RevenueRangeSelect from "../RevenueRangeSelect";` with:

```ts
import RangeSelect from "@/app/_components/Instructor/_shared/RangeSelect";
```

and replace the JSX `<RevenueRangeSelect onChange={setRange} value={range} />` with
`<RangeSelect onChange={setRange} value={range} />`.

- [ ] **Step 6: Delete the now-unused folders**

```bash
git rm -r app/_components/Instructor/Revenue/components/RevenueSummaryCards/components/StatCard \
          app/_components/Instructor/Revenue/components/RevenueSummaryCards/components/DeltaBadge \
          app/_components/Instructor/Revenue/components/RevenueRangeSelect
```

- [ ] **Step 7: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: clean; no dangling imports to the deleted folders.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(instructor): share StatCard, DeltaBadge, RangeSelect"
```

---

## Task 3: Analytics DTOs

**Files:**
- Create: `server/entities/analytics/analytics.ts`

**Interfaces:**
- Produces: `Metric`, `AnalyticsSummary`, `CourseAnalyticsSummary`, `EnrollmentTrendPoint`, `CompletionTrendPoint`, `EnrollmentsByCourseItem`, `LessonFunnelItem`.

- [ ] **Step 1: Create the DTO module**

```ts
// server/entities/analytics/analytics.ts
import type { StatDelta } from "@/lib/stats/statDelta";

/** A summary stat: a numeric value plus a month-over-month delta. */
export type Metric = { value: number; delta: StatDelta };

/** The four summary cards (global or per-course). */
export type AnalyticsSummary = {
	/** All-time enrollment count; delta = this month's new vs last month's. */
	enrollments: Metric;
	/** Enrollments with lastAccessedAt this month; delta vs last month. */
	activeLearners: Metric;
	/** Current average enrollment progress (0..100); delta always {kind:"none"} (no history stored). */
	avgProgress: Metric;
	/** Quiz pass rate (0..100); delta = this month's vs last month's. attempts===0 → render "—". */
	quizPassRate: Metric & { attempts: number };
};

export type CourseAnalyticsSummary = AnalyticsSummary;

/** One point of the enrollments+completions area chart. period = ISO date (bucket start). */
export type EnrollmentTrendPoint = {
	period: string;
	enrollments: number;
	completions: number;
};

/** One point of the completion-rate line chart. rate = completions/enrollments * 100, 0..100. */
export type CompletionTrendPoint = { period: string; rate: number };

/** One slice of the enrollments-by-course pie. */
export type EnrollmentsByCourseItem = {
	courseId: string;
	title: string;
	enrollments: number;
};

/** One lesson in the per-course completion funnel, in course order. */
export type LessonFunnelItem = {
	lessonId: string;
	title: string;
	order: number;
	enrolled: number;
	completed: number;
};
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/entities/analytics/analytics.ts
git commit -m "feat(analytics): add analytics DTOs"
```

---

## Task 4: AnalyticsRepository — scoping + summary aggregates

**Files:**
- Create: `server/repositories/analytics.repository.ts`
- Test: `server/repositories/analytics.repository.integration.test.ts`

**Interfaces:**
- Produces (singleton `analyticsRepository`):
  - `getInstructorCourseIds(instructorId: string): Promise<string[]>`
  - `countEnrollments(courseIds: string[], window?: { gte: Date; lt: Date }): Promise<number>`
  - `countActiveLearners(courseIds: string[], window: { gte: Date; lt: Date }): Promise<number>`
  - `getAvgProgress(courseIds: string[]): Promise<number>`
  - `getQuizStats(courseIds: string[], window?: { gte: Date; lt: Date }): Promise<{ attempts: number; correct: number }>`

- [ ] **Step 1: Write the failing integration test**

```ts
// server/repositories/analytics.repository.integration.test.ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";
import { analyticsRepository } from "./analytics.repository";

describe("AnalyticsRepository summary aggregates", () => {
	it("scopes course ids, counts enrollments, active learners, avg progress, quiz stats", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const otherCourse = await makeCourse({ instructorId: other.id });

		const ids = await analyticsRepository.getInstructorCourseIds(instructor.id);
		expect(ids).toEqual([course.id]);

		const now = new Date();
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			progress: 80,
			lastAccessedAt: now,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			progress: 20,
			lastAccessedAt: new Date("2000-01-01"),
		});
		// enrollment on someone else's course must be excluded
		await makeEnrollment({ studentId: s1.id, courseId: otherCourse.id, progress: 100 });

		expect(await analyticsRepository.countEnrollments([course.id])).toBe(2);
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
		expect(
			await analyticsRepository.countActiveLearners([course.id], {
				gte: monthStart,
				lt: monthEnd,
			}),
		).toBe(1);
		expect(await analyticsRepository.getAvgProgress([course.id])).toBe(50);
		expect(await analyticsRepository.getAvgProgress([])).toBe(0);

		// quiz stats
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const quiz = await testDb.quiz.create({
			data: { question: "q", options: ["a", "b"], correct: "a", lessonId: lesson.id },
		});
		await testDb.quizAttempt.create({
			data: { quizId: quiz.id, studentId: s1.id, selectedAnswer: "a", isCorrect: true },
		});
		await testDb.quizAttempt.create({
			data: { quizId: quiz.id, studentId: s2.id, selectedAnswer: "b", isCorrect: false },
		});
		const stats = await analyticsRepository.getQuizStats([course.id]);
		expect(stats).toEqual({ attempts: 2, correct: 1 });
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts`
Expected: FAIL — `Cannot find module './analytics.repository'`.

- [ ] **Step 3: Implement the repository**

```ts
// server/repositories/analytics.repository.ts
import { db } from "@/server/db";

type Window = { gte: Date; lt: Date };

class AnalyticsRepository {
	/** The instructor's non-deleted course ids. */
	async getInstructorCourseIds(instructorId: string): Promise<string[]> {
		const rows = await db.course.findMany({
			where: { instructorId, deletedAt: null },
			select: { id: true },
		});
		return rows.map((r) => r.id);
	}

	async countEnrollments(courseIds: string[], window?: Window): Promise<number> {
		if (courseIds.length === 0) return 0;
		return db.enrollment.count({
			where: {
				courseId: { in: courseIds },
				...(window ? { enrolledAt: { gte: window.gte, lt: window.lt } } : {}),
			},
		});
	}

	async countActiveLearners(courseIds: string[], window: Window): Promise<number> {
		if (courseIds.length === 0) return 0;
		return db.enrollment.count({
			where: {
				courseId: { in: courseIds },
				lastAccessedAt: { gte: window.gte, lt: window.lt },
			},
		});
	}

	async getAvgProgress(courseIds: string[]): Promise<number> {
		if (courseIds.length === 0) return 0;
		const agg = await db.enrollment.aggregate({
			where: { courseId: { in: courseIds } },
			_avg: { progress: true },
		});
		return Math.round(agg._avg.progress ?? 0);
	}

	async getQuizStats(
		courseIds: string[],
		window?: Window,
	): Promise<{ attempts: number; correct: number }> {
		if (courseIds.length === 0) return { attempts: 0, correct: 0 };
		const where = {
			quiz: { lesson: { section: { courseId: { in: courseIds } } } },
			...(window ? { createdAt: { gte: window.gte, lt: window.lt } } : {}),
		};
		const [attempts, correct] = await Promise.all([
			db.quizAttempt.count({ where }),
			db.quizAttempt.count({ where: { ...where, isCorrect: true } }),
		]);
		return { attempts, correct };
	}
}

export const analyticsRepository = new AnalyticsRepository();
```

> Note: `db` is the Prisma client imported as `import { db } from "@/server/db";` — same as
> `server/repositories/payment.repository.ts` (verified).

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/analytics.repository.ts server/repositories/analytics.repository.integration.test.ts
git commit -m "feat(analytics): repository summary aggregates"
```

---

## Task 5: AnalyticsRepository — enrollment trend (by bucket)

**Files:**
- Modify: `server/repositories/analytics.repository.ts`
- Modify: `server/repositories/analytics.repository.integration.test.ts`

**Interfaces:**
- Produces: `getEnrollmentTrend(courseIds: string[], since: Date, bucket: "day" | "month"): Promise<{ period: Date; enrollments: number; completions: number }[]>`

- [ ] **Step 1: Add the failing test (append a new describe block)**

```ts
// append to server/repositories/analytics.repository.integration.test.ts
import { startOfMonth, subMonths } from "date-fns";

describe("AnalyticsRepository.getEnrollmentTrend", () => {
	it("buckets enrollments and completions by month within range", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const now = new Date();
		const thisMonth = startOfMonth(now);
		const lastMonth = startOfMonth(subMonths(now, 1));

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			enrolledAt: lastMonth,
			completedAt: lastMonth,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			enrolledAt: thisMonth,
		});

		const since = startOfMonth(subMonths(now, 2));
		const rows = await analyticsRepository.getEnrollmentTrend([course.id], since, "month");

		const total = rows.reduce((s, r) => s + r.enrollments, 0);
		const completed = rows.reduce((s, r) => s + r.completions, 0);
		expect(total).toBe(2);
		expect(completed).toBe(1);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts -t "getEnrollmentTrend"`
Expected: FAIL — `getEnrollmentTrend is not a function`.

- [ ] **Step 3: Implement the method (add to the class)**

```ts
// add inside AnalyticsRepository
async getEnrollmentTrend(
	courseIds: string[],
	since: Date,
	bucket: "day" | "month",
): Promise<{ period: Date; enrollments: number; completions: number }[]> {
	if (courseIds.length === 0) return [];
	const rows = await db.$queryRaw<
		{ period: Date; enrollments: bigint; completions: bigint }[]
	>`
		SELECT date_trunc(${bucket}, "enrolledAt") AS period,
		       COUNT(*) AS enrollments,
		       COUNT("completedAt") AS completions
		FROM enrollments
		WHERE "courseId" = ANY(${courseIds})
		  AND "enrolledAt" >= ${since}
		GROUP BY period
		ORDER BY period ASC
	`;
	return rows.map((r) => ({
		period: r.period,
		enrollments: Number(r.enrollments),
		completions: Number(r.completions),
	}));
}
```

> Verify the `enrollments` table column names against `prisma/schema/enrollment.prisma` /
> `@@map("enrollments")`. `enrolledAt`/`completedAt`/`courseId` have no `@map`, so they are
> camelCase quoted identifiers in Postgres (as shown). If a `npx prisma` introspection shows
> snake_case, adjust the quoted names accordingly.

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts -t "getEnrollmentTrend"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/analytics.repository.ts server/repositories/analytics.repository.integration.test.ts
git commit -m "feat(analytics): repository enrollment trend by bucket"
```

---

## Task 6: AnalyticsRepository — enrollments-by-course + lesson funnel

**Files:**
- Modify: `server/repositories/analytics.repository.ts`
- Modify: `server/repositories/analytics.repository.integration.test.ts`

**Interfaces:**
- Produces:
  - `getEnrollmentsByCourse(courseIds: string[], since: Date): Promise<{ courseId: string; title: string; enrollments: number }[]>`
  - `getLessonCompletions(courseId: string): Promise<Map<string, number>>` (lessonId → completed count)

- [ ] **Step 1: Add the failing test**

```ts
// append to the integration test
describe("AnalyticsRepository by-course + lesson completions", () => {
	it("groups enrollments by course and counts completed lessons", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
			title: "Course A",
		});
		const section = await makeSection({ courseId: course.id });
		const l1 = await makeLesson({ sectionId: section.id, order: 0, title: "L1" });
		const l2 = await makeLesson({ sectionId: section.id, order: 1, title: "L2" });

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		await makeEnrollment({ studentId: s2.id, courseId: course.id });
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s1.id, isCompleted: true },
		});
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s2.id, isCompleted: true },
		});
		await testDb.lessonProgress.create({
			data: { lessonId: l2.id, studentId: s1.id, isCompleted: true },
		});

		const since = new Date("2000-01-01");
		const byCourse = await analyticsRepository.getEnrollmentsByCourse([course.id], since);
		expect(byCourse).toEqual([
			{ courseId: course.id, title: "Course A", enrollments: 2 },
		]);

		const completions = await analyticsRepository.getLessonCompletions(course.id);
		expect(completions.get(l1.id)).toBe(2);
		expect(completions.get(l2.id)).toBe(1);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts -t "by-course"`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement both methods**

```ts
// add inside AnalyticsRepository
async getEnrollmentsByCourse(
	courseIds: string[],
	since: Date,
): Promise<{ courseId: string; title: string; enrollments: number }[]> {
	if (courseIds.length === 0) return [];
	const grouped = await db.enrollment.groupBy({
		by: ["courseId"],
		where: { courseId: { in: courseIds }, enrolledAt: { gte: since } },
		_count: { _all: true },
		orderBy: { _count: { courseId: "desc" } },
	});
	if (grouped.length === 0) return [];
	const courses = await db.course.findMany({
		where: { id: { in: grouped.map((g) => g.courseId) } },
		select: { id: true, title: true },
	});
	const titleById = new Map(courses.map((c) => [c.id, c.title]));
	return grouped.map((g) => ({
		courseId: g.courseId,
		title: titleById.get(g.courseId) ?? "Untitled course",
		enrollments: g._count._all,
	}));
}

/** lessonId → number of students who completed it (for the funnel). */
async getLessonCompletions(courseId: string): Promise<Map<string, number>> {
	const grouped = await db.lessonProgress.groupBy({
		by: ["lessonId"],
		where: {
			isCompleted: true,
			lesson: { section: { courseId } },
		},
		_count: { _all: true },
	});
	return new Map(grouped.map((g) => [g.lessonId, g._count._all]));
}
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm test:integration server/repositories/analytics.repository.integration.test.ts -t "by-course"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/analytics.repository.ts server/repositories/analytics.repository.integration.test.ts
git commit -m "feat(analytics): repository by-course + lesson completions"
```

---

## Task 7: Bucket zero-fill helper

**Files:**
- Create: `lib/stats/fillBuckets.ts`
- Test: `lib/stats/fillBuckets.test.ts`

**Interfaces:**
- Produces: `fillBuckets<T>(rows: { period: Date }[] & T[], since: Date, now: Date, bucket: "day" | "month", empty: Omit<T, "period">): { period: string; ... }[]` — see signature below.

- [ ] **Step 1: Write the failing unit test**

```ts
// lib/stats/fillBuckets.test.ts
import { describe, expect, it } from "vitest";
import { fillBuckets } from "./fillBuckets";

describe("fillBuckets", () => {
	it("fills missing months with the empty template, keyed by month", () => {
		const now = new Date("2026-03-15T00:00:00Z");
		const since = new Date("2026-01-01T00:00:00Z");
		const rows = [{ period: new Date("2026-02-01T00:00:00Z"), enrollments: 5 }];

		const out = fillBuckets(rows, since, now, "month", { enrollments: 0 });

		expect(out).toHaveLength(3);
		expect(out.map((r) => r.enrollments)).toEqual([0, 5, 0]);
		expect(out[1].period).toBe("2026-02-01");
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:unit lib/stats/fillBuckets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/stats/fillBuckets.ts
import {
	eachDayOfInterval,
	eachMonthOfInterval,
	formatISO,
	subDays,
} from "date-fns";

const keyOf = (d: Date, bucket: "day" | "month") =>
	bucket === "day"
		? formatISO(d, { representation: "date" })
		: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * Zero-fills a bucketed series so every day/month in [since, now] is present.
 * `rows` carry a `period: Date`; `empty` supplies the zero values for the other fields.
 */
export function fillBuckets<T extends Record<string, number>>(
	rows: ({ period: Date } & T)[],
	since: Date,
	now: Date,
	bucket: "day" | "month",
	empty: T,
): ({ period: string } & T)[] {
	const starts =
		bucket === "day"
			? eachDayOfInterval({ start: since, end: subDays(now, 1) })
			: eachMonthOfInterval({ start: since, end: now });
	const byKey = new Map(rows.map((r) => [keyOf(r.period, bucket), r] as const));
	return starts.map((start) => {
		const hit = byKey.get(keyOf(start, bucket));
		const values = hit ? { ...empty, ...stripPeriod(hit) } : { ...empty };
		return { period: formatISO(start, { representation: "date" }), ...values };
	});
}

function stripPeriod<T>(row: { period: Date } & T): T {
	const { period: _drop, ...rest } = row;
	return rest as T;
}
```

- [ ] **Step 4: Run it, expect PASS**

Run: `pnpm test:unit lib/stats/fillBuckets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/fillBuckets.ts lib/stats/fillBuckets.test.ts
git commit -m "feat(stats): bucket zero-fill helper"
```

---

## Task 8: AnalyticsService — errors + global methods

**Files:**
- Create: `server/services/analytics/analytics.errors.ts`
- Create: `server/services/analytics/analytics.service.ts`
- Test: `server/services/analytics/analytics.service.integration.test.ts`

**Interfaces:**
- Consumes: `analyticsRepository.*` (Tasks 4-6), `resolveRange`, `computeDelta`, `getMonthWindows`, `fillBuckets`.
- Produces (singleton `analyticsService`):
  - `getOverviewSummary(instructorId: string): Promise<AnalyticsSummary>`
  - `getEnrollmentTrend(instructorId: string, range: StatsRange): Promise<EnrollmentTrendPoint[]>`
  - `getCompletionTrend(instructorId: string, range: StatsRange): Promise<CompletionTrendPoint[]>`
  - `getEnrollmentsByCourse(instructorId: string, range: StatsRange): Promise<EnrollmentsByCourseItem[]>`

- [ ] **Step 1: Write the failing integration test**

```ts
// server/services/analytics/analytics.service.integration.test.ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { analyticsService } from "./analytics.service";

describe("AnalyticsService.getOverviewSummary", () => {
	it("aggregates across the instructor's courses with deltas", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const now = new Date();
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: s1.id,
			courseId: course.id,
			progress: 100,
			enrolledAt: now,
			lastAccessedAt: now,
		});
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			progress: 50,
			enrolledAt: now,
		});

		const summary = await analyticsService.getOverviewSummary(instructor.id);
		expect(summary.enrollments.value).toBe(2);
		expect(summary.avgProgress.value).toBe(75);
		expect(summary.avgProgress.delta).toEqual({ kind: "none" });
		expect(summary.activeLearners.value).toBe(1);
	});

	it("returns an empty-but-valid summary for an instructor with no courses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const summary = await analyticsService.getOverviewSummary(instructor.id);
		expect(summary.enrollments.value).toBe(0);
		expect(summary.quizPassRate.attempts).toBe(0);
		expect(summary.avgProgress.value).toBe(0);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:integration server/services/analytics/analytics.service.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the errors file**

```ts
// server/services/analytics/analytics.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class AnalyticsError extends DomainError {}

export class CourseNotFoundError extends AnalyticsError {
	constructor(ctx?: Record<string, unknown>) {
		super("Course not found", "NOT_FOUND", undefined, ctx);
	}
}
```

- [ ] **Step 4: Implement the service (global methods + shared summary builder)**

```ts
// server/services/analytics/analytics.service.ts
import { fillBuckets } from "@/lib/stats/fillBuckets";
import { computeDelta } from "@/lib/stats/computeDelta";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import { resolveRange } from "@/lib/stats/revenueRange";
import { logger } from "@/server/utils/logger";
import type {
	AnalyticsSummary,
	CompletionTrendPoint,
	EnrollmentTrendPoint,
	EnrollmentsByCourseItem,
} from "@/server/entities/analytics/analytics";
import type { StatsRange } from "@/server/entities/stats/range";
import { analyticsRepository } from "@/server/repositories/analytics.repository";

class AnalyticsService {
	private async buildSummary(courseIds: string[]): Promise<AnalyticsSummary> {
		const now = new Date();
		const { startThisMonth, startLastMonth, startNextMonth } = getMonthWindows(now);
		const thisMonth = { gte: startThisMonth, lt: startNextMonth };
		const lastMonth = { gte: startLastMonth, lt: startThisMonth };

		const [
			enrollTotal,
			enrollThis,
			enrollLast,
			activeThis,
			activeLast,
			avgProgress,
			quizThis,
			quizLast,
			quizAll,
		] = await Promise.all([
			analyticsRepository.countEnrollments(courseIds),
			analyticsRepository.countEnrollments(courseIds, thisMonth),
			analyticsRepository.countEnrollments(courseIds, lastMonth),
			analyticsRepository.countActiveLearners(courseIds, thisMonth),
			analyticsRepository.countActiveLearners(courseIds, lastMonth),
			analyticsRepository.getAvgProgress(courseIds),
			analyticsRepository.getQuizStats(courseIds, thisMonth),
			analyticsRepository.getQuizStats(courseIds, lastMonth),
			analyticsRepository.getQuizStats(courseIds),
		]);

		const rate = (s: { attempts: number; correct: number }) =>
			s.attempts === 0 ? 0 : Math.round((s.correct / s.attempts) * 100);

		return {
			enrollments: {
				value: enrollTotal,
				delta: computeDelta(enrollThis, enrollLast),
			},
			activeLearners: {
				value: activeThis,
				delta: computeDelta(activeThis, activeLast),
			},
			avgProgress: { value: avgProgress, delta: { kind: "none" } },
			quizPassRate: {
				value: rate(quizAll),
				attempts: quizAll.attempts,
				delta: computeDelta(rate(quizThis), rate(quizLast)),
			},
		};
	}

	async getOverviewSummary(instructorId: string): Promise<AnalyticsSummary> {
		logger.info("Getting instructor analytics overview", { instructorId });
		const courseIds = await analyticsRepository.getInstructorCourseIds(instructorId);
		return this.buildSummary(courseIds);
	}

	async getEnrollmentTrend(
		instructorId: string,
		range: StatsRange,
	): Promise<EnrollmentTrendPoint[]> {
		const courseIds = await analyticsRepository.getInstructorCourseIds(instructorId);
		return this.enrollmentTrendFor(courseIds, range);
	}

	async getCompletionTrend(
		instructorId: string,
		range: StatsRange,
	): Promise<CompletionTrendPoint[]> {
		const trend = await this.getEnrollmentTrend(instructorId, range);
		return trend.map((p) => ({
			period: p.period,
			rate: p.enrollments === 0 ? 0 : Math.round((p.completions / p.enrollments) * 100),
		}));
	}

	async getEnrollmentsByCourse(
		instructorId: string,
		range: StatsRange,
	): Promise<EnrollmentsByCourseItem[]> {
		const { since } = resolveRange(range);
		const courseIds = await analyticsRepository.getInstructorCourseIds(instructorId);
		return analyticsRepository.getEnrollmentsByCourse(courseIds, since);
	}

	protected async enrollmentTrendFor(
		courseIds: string[],
		range: StatsRange,
	): Promise<EnrollmentTrendPoint[]> {
		const now = new Date();
		const { since, bucket } = resolveRange(range, now);
		const rows = await analyticsRepository.getEnrollmentTrend(courseIds, since, bucket);
		return fillBuckets(rows, since, now, bucket, { enrollments: 0, completions: 0 });
	}
}

export const analyticsService = new AnalyticsService();
```

> `logger` is at `@/server/utils/logger` (verified) and `db` at `@/server/db` (verified).

- [ ] **Step 5: Run the test, expect PASS**

Run: `pnpm test:integration server/services/analytics/analytics.service.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/services/analytics/
git commit -m "feat(analytics): service errors + global aggregates"
```

---

## Task 9: AnalyticsService — per-course methods + ownership

**Files:**
- Modify: `server/services/analytics/analytics.service.ts`
- Modify: `server/services/analytics/analytics.service.integration.test.ts`

**Interfaces:**
- Consumes: `courseRepository.getOwnCourse`.
- Produces:
  - `getCourseSummary(instructorId: string, courseId: string): Promise<CourseAnalyticsSummary>`
  - `getCourseEnrollmentTrend(instructorId: string, courseId: string, range: StatsRange): Promise<EnrollmentTrendPoint[]>`
  - `getLessonFunnel(instructorId: string, courseId: string): Promise<LessonFunnelItem[]>`

- [ ] **Step 1: Add the failing tests**

```ts
// append to analytics.service.integration.test.ts
import { makeLesson, makeSection } from "@/test/factories";
import { TRPCError } from "@trpc/server";

describe("AnalyticsService per-course", () => {
	it("rejects a course the instructor does not own", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const foreign = await makeCourse({ instructorId: other.id });
		await expect(
			analyticsService.getCourseSummary(instructor.id, foreign.id),
		).rejects.toThrow();
	});

	it("builds an ordered lesson funnel for an owned course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const section = await makeSection({ courseId: course.id, order: 0 });
		const l1 = await makeLesson({ sectionId: section.id, order: 0, title: "Intro" });
		const l2 = await makeLesson({ sectionId: section.id, order: 1, title: "Deep dive" });
		const s1 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		const { testDb } = await import("@/test/db");
		await testDb.lessonProgress.create({
			data: { lessonId: l1.id, studentId: s1.id, isCompleted: true },
		});

		const funnel = await analyticsService.getLessonFunnel(instructor.id, course.id);
		expect(funnel.map((f) => f.title)).toEqual(["Intro", "Deep dive"]);
		expect(funnel.map((f) => f.order)).toEqual([0, 1]);
		expect(funnel[0]).toMatchObject({ lessonId: l1.id, enrolled: 1, completed: 1 });
		expect(funnel[1]).toMatchObject({ lessonId: l2.id, enrolled: 1, completed: 0 });
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:integration server/services/analytics/analytics.service.integration.test.ts -t "per-course"`
Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement (add imports + methods)**

Add imports at the top of `analytics.service.ts`:

```ts
import type {
	CourseAnalyticsSummary,
	LessonFunnelItem,
} from "@/server/entities/analytics/analytics";
import { courseRepository } from "@/server/repositories/course.repository";
import { CourseNotFoundError } from "./analytics.errors";
```

Add methods inside the class:

```ts
private async assertOwnedCourse(instructorId: string, courseId: string) {
	const course = await courseRepository.getOwnCourse(courseId, instructorId);
	if (!course) throw new CourseNotFoundError({ instructorId, courseId });
	return course;
}

async getCourseSummary(
	instructorId: string,
	courseId: string,
): Promise<CourseAnalyticsSummary> {
	await this.assertOwnedCourse(instructorId, courseId);
	return this.buildSummary([courseId]);
}

async getCourseEnrollmentTrend(
	instructorId: string,
	courseId: string,
	range: StatsRange,
): Promise<EnrollmentTrendPoint[]> {
	await this.assertOwnedCourse(instructorId, courseId);
	return this.enrollmentTrendFor([courseId], range);
}

async getLessonFunnel(
	instructorId: string,
	courseId: string,
): Promise<LessonFunnelItem[]> {
	const course = await this.assertOwnedCourse(instructorId, courseId);
	const [enrolled, completions] = await Promise.all([
		analyticsRepository.countEnrollments([courseId]),
		analyticsRepository.getLessonCompletions(courseId),
	]);
	const lessons = course.sections.flatMap((s) => s.lessons);
	return lessons.map((lesson, index) => ({
		lessonId: lesson.id,
		title: lesson.title,
		order: index,
		enrolled,
		completed: completions.get(lesson.id) ?? 0,
	}));
}
```

> `getOwnCourse` returns the course with `sections` (ordered) → `lessons` (ordered), so
> `flatMap` yields lessons in course order; `index` is the global funnel position.

- [ ] **Step 4: Run the test, expect PASS**

Run: `pnpm test:integration server/services/analytics/analytics.service.integration.test.ts -t "per-course"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/analytics/
git commit -m "feat(analytics): per-course aggregates + ownership guard"
```

---

## Task 10: Analytics router + registration

**Files:**
- Create: `server/api/routers/analytics.ts`
- Modify: `server/api/root.ts` (register router)

**Interfaces:**
- Produces: `analyticsRouter` with `getOverviewSummary`, `getEnrollmentTrend`, `getCompletionTrend`, `getEnrollmentsByCourse`, `getCourseSummary`, `getCourseEnrollmentTrend`, `getLessonFunnel`.

- [ ] **Step 1: Implement the router**

```ts
// server/api/routers/analytics.ts
import { z } from "zod";
import { createTRPCRouter, instructorProcedure } from "@/server/api/trpc";
import { statsRangeInput } from "@/server/entities/stats/range";
import { analyticsService } from "@/server/services/analytics/analytics.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

const courseInput = z.object({ courseId: z.string() });
const courseRangeInput = courseInput.merge(statsRangeInput);

export const analyticsRouter = createTRPCRouter({
	getOverviewSummary: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await analyticsService.getOverviewSummary(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getEnrollmentTrend: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getEnrollmentTrend(ctx.session.user.id, input.range);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCompletionTrend: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCompletionTrend(ctx.session.user.id, input.range);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getEnrollmentsByCourse: instructorProcedure
		.input(statsRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getEnrollmentsByCourse(ctx.session.user.id, input.range);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCourseSummary: instructorProcedure
		.input(courseInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCourseSummary(ctx.session.user.id, input.courseId);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getCourseEnrollmentTrend: instructorProcedure
		.input(courseRangeInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getCourseEnrollmentTrend(
					ctx.session.user.id,
					input.courseId,
					input.range,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getLessonFunnel: instructorProcedure
		.input(courseInput)
		.query(async ({ ctx, input }) => {
			try {
				return await analyticsService.getLessonFunnel(ctx.session.user.id, input.courseId);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
```

- [ ] **Step 2: Register in root.ts**

In `server/api/root.ts` add the import (alphabetical, near the top of the imports):

```ts
import { analyticsRouter } from "@/server/api/routers/analytics";
```

and add to the `createTRPCRouter({ ... })` object:

```ts
	analytics: analyticsRouter,
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean — `api.analytics.*` is now typed on both server and client.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/analytics.ts server/api/root.ts
git commit -m "feat(analytics): tRPC router + registration"
```

---

## Task 11: RSC request helpers

**Files:**
- Create: `lib/requests/instructor/getAnalyticsSummary.ts`
- Create: `lib/requests/instructor/getCourseAnalyticsSummary.ts`

**Interfaces:**
- Produces: default async fns returning `AnalyticsSummary` (safe empty fallback) and `CourseAnalyticsSummary | null` (null when not owned).

- [ ] **Step 1: Implement the global helper**

```ts
// lib/requests/instructor/getAnalyticsSummary.ts
import type { AnalyticsSummary } from "@/server/entities/analytics/analytics";
import { api } from "@/trpc/server";

const EMPTY: AnalyticsSummary = {
	enrollments: { value: 0, delta: { kind: "none" } },
	activeLearners: { value: 0, delta: { kind: "none" } },
	avgProgress: { value: 0, delta: { kind: "none" } },
	quizPassRate: { value: 0, attempts: 0, delta: { kind: "none" } },
};

const getAnalyticsSummary = async (): Promise<AnalyticsSummary> => {
	try {
		return await api.analytics.getOverviewSummary();
	} catch (error) {
		console.error("Error fetching analytics summary:", error);
		return EMPTY;
	}
};

export default getAnalyticsSummary;
```

- [ ] **Step 2: Implement the per-course helper**

```ts
// lib/requests/instructor/getCourseAnalyticsSummary.ts
import type { CourseAnalyticsSummary } from "@/server/entities/analytics/analytics";
import { api } from "@/trpc/server";

const getCourseAnalyticsSummary = async (
	courseId: string,
): Promise<CourseAnalyticsSummary | null> => {
	try {
		return await api.analytics.getCourseSummary({ courseId });
	} catch (error) {
		console.error("Error fetching course analytics summary:", error);
		return null;
	}
};

export default getCourseAnalyticsSummary;
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/requests/instructor/getAnalyticsSummary.ts lib/requests/instructor/getCourseAnalyticsSummary.ts
git commit -m "feat(analytics): RSC request helpers"
```

---

## Task 12: Global analytics UI + page

**Files:**
- Create: `app/_components/Instructor/Analytics/index.tsx`
- Create: `app/_components/Instructor/Analytics/components/AnalyticsSummaryCards/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/Analytics/components/AnalyticsCharts/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/Analytics/components/EnrollmentTrendChart/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/Analytics/components/CompletionTrendChart/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/Analytics/components/EnrollmentsByCourseChart/{index.tsx,types.ts}`
- Modify (replace): `app/instructor/analytics/page.tsx`

**Interfaces:**
- Consumes: `getAnalyticsSummary`, `getTopPerformingCourses`, `api.analytics.*` (client), shared `StatCard`/`DeltaBadge`/`RangeSelect`.

- [ ] **Step 1: Summary cards**

```tsx
// app/_components/Instructor/Analytics/components/AnalyticsSummaryCards/index.tsx
import { GraduationCap, Activity, TrendingUp, CheckCircle2 } from "lucide-react";
import DeltaBadge from "@/app/_components/Instructor/_shared/DeltaBadge";
import StatCard from "@/app/_components/Instructor/_shared/StatCard";
import type { AnalyticsSummaryCardsProps } from "./types";

export default function AnalyticsSummaryCards({ summary }: AnalyticsSummaryCardsProps) {
	const passRate =
		summary.quizPassRate.attempts === 0 ? "—" : `${summary.quizPassRate.value}%`;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<GraduationCap className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Total Enrollments"
				subline={<DeltaBadge delta={summary.enrollments.delta} />}
				value={summary.enrollments.value.toLocaleString()}
			/>
			<StatCard
				icon={<Activity className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Active Learners"
				subline={<DeltaBadge delta={summary.activeLearners.delta} />}
				value={summary.activeLearners.value.toLocaleString()}
			/>
			<StatCard
				icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="Avg. Progress"
				value={`${summary.avgProgress.value}%`}
			/>
			<StatCard
				icon={<CheckCircle2 className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Quiz Pass Rate"
				subline={<DeltaBadge delta={summary.quizPassRate.delta} />}
				value={passRate}
			/>
		</div>
	);
}
```

```ts
// app/_components/Instructor/Analytics/components/AnalyticsSummaryCards/types.ts
import type { AnalyticsSummary } from "@/server/entities/analytics/analytics";

export type AnalyticsSummaryCardsProps = { summary: AnalyticsSummary };
```

- [ ] **Step 2: Enrollment trend chart**

```tsx
// app/_components/Instructor/Analytics/components/EnrollmentTrendChart/index.tsx
"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { EnrollmentTrendChartProps } from "./types";

const config = {
	enrollments: { label: "Enrollments", color: "var(--chart-1)" },
	completions: { label: "Completions", color: "var(--chart-2)" },
};

export default function EnrollmentTrendChart({ data, isLoading }: EnrollmentTrendChartProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Enrollments & Completions</h2>
				<p className="text-muted-foreground text-sm">New enrollments and completions over time</p>
			</div>
			{isLoading && <div className="h-[300px] animate-pulse rounded-lg bg-muted" />}
			{!isLoading && (
				<ChartContainer className="h-[300px] w-full" config={config}>
					<AreaChart data={data ?? []} margin={{ left: 4, right: 4 }}>
						<defs>
							<linearGradient id="fillEnroll" x1="0" x2="0" y1="0" y2="1">
								<stop offset="5%" stopColor="var(--color-enrollments)" stopOpacity={0.8} />
								<stop offset="95%" stopColor="var(--color-enrollments)" stopOpacity={0.1} />
							</linearGradient>
							<linearGradient id="fillComplete" x1="0" x2="0" y1="0" y2="1">
								<stop offset="5%" stopColor="var(--color-completions)" stopOpacity={0.8} />
								<stop offset="95%" stopColor="var(--color-completions)" stopOpacity={0.1} />
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
						<YAxis axisLine={false} tickLine={false} tickMargin={8} />
						<ChartTooltip
							content={<ChartTooltipContent labelFormatter={(l) => format(parseISO(l), "MMM yyyy")} />}
							cursor={false}
						/>
						<Area dataKey="completions" fill="url(#fillComplete)" stroke="var(--color-completions)" strokeWidth={2} type="monotone" />
						<Area dataKey="enrollments" fill="url(#fillEnroll)" stroke="var(--color-enrollments)" strokeWidth={2} type="monotone" />
					</AreaChart>
				</ChartContainer>
			)}
		</Card>
	);
}
```

```ts
// app/_components/Instructor/Analytics/components/EnrollmentTrendChart/types.ts
import type { EnrollmentTrendPoint } from "@/server/entities/analytics/analytics";

export type EnrollmentTrendChartProps = {
	data: EnrollmentTrendPoint[] | undefined;
	isLoading: boolean;
};
```

- [ ] **Step 3: Completion trend chart**

```tsx
// app/_components/Instructor/Analytics/components/CompletionTrendChart/index.tsx
"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { CompletionTrendChartProps } from "./types";

const config = { rate: { label: "Completion Rate", color: "var(--chart-1)" } };

export default function CompletionTrendChart({ data, isLoading }: CompletionTrendChartProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Completion Rate Trend</h2>
				<p className="text-muted-foreground text-sm">Share of each cohort that completed</p>
			</div>
			{isLoading && <div className="h-[244px] animate-pulse rounded-lg bg-muted" />}
			{!isLoading && (
				<ChartContainer className="h-[244px] w-full" config={config}>
					<LineChart data={data ?? []} margin={{ left: 4, right: 8 }}>
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
							domain={[0, 100]}
							tickFormatter={(v: number) => `${v}%`}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							content={<ChartTooltipContent labelFormatter={(l) => format(parseISO(l), "MMM yyyy")} />}
							cursor={false}
						/>
						<Line dataKey="rate" dot={false} stroke="var(--color-rate)" strokeWidth={2} type="monotone" />
					</LineChart>
				</ChartContainer>
			)}
		</Card>
	);
}
```

```ts
// app/_components/Instructor/Analytics/components/CompletionTrendChart/types.ts
import type { CompletionTrendPoint } from "@/server/entities/analytics/analytics";

export type CompletionTrendChartProps = {
	data: CompletionTrendPoint[] | undefined;
	isLoading: boolean;
};
```

- [ ] **Step 4: Enrollments-by-course pie**

```tsx
// app/_components/Instructor/Analytics/components/EnrollmentsByCourseChart/index.tsx
"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { EnrollmentsByCourseChartProps } from "./types";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export default function EnrollmentsByCourseChart({ data, isLoading }: EnrollmentsByCourseChartProps) {
	const items = data ?? [];
	const total = items.reduce((s, i) => s + i.enrollments, 0);
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Enrollments by Course</h2>
				<p className="text-muted-foreground text-sm">How enrollments split across your courses</p>
			</div>
			{isLoading && <div className="h-[200px] animate-pulse rounded-lg bg-muted" />}
			{!isLoading && total === 0 && (
				<p className="py-12 text-center text-muted-foreground text-sm">No enrollments in this range yet.</p>
			)}
			{!isLoading && total > 0 && (
				<div className="flex flex-col items-center gap-6 sm:flex-row">
					<ChartContainer className="aspect-square h-[200px]" config={{}}>
						<PieChart>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={false} />
							<Pie data={items} dataKey="enrollments" innerRadius={50} nameKey="title" strokeWidth={4}>
								{items.map((item, i) => (
									<Cell fill={COLORS[i % COLORS.length]} key={item.courseId} />
								))}
							</Pie>
						</PieChart>
					</ChartContainer>
					<ul className="flex-1 space-y-3">
						{items.map((item, i) => (
							<li className="flex items-center gap-3" key={item.courseId}>
								<span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
								<span className="flex-1 truncate text-sm">{item.title}</span>
								<span className="font-medium text-muted-foreground text-sm">
									{Math.round((item.enrollments / total) * 100)}%
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</Card>
	);
}
```

```ts
// app/_components/Instructor/Analytics/components/EnrollmentsByCourseChart/types.ts
import type { EnrollmentsByCourseItem } from "@/server/entities/analytics/analytics";

export type EnrollmentsByCourseChartProps = {
	data: EnrollmentsByCourseItem[] | undefined;
	isLoading: boolean;
};
```

- [ ] **Step 5: Charts container (client, owns range)**

```tsx
// app/_components/Instructor/Analytics/components/AnalyticsCharts/index.tsx
"use client";

import { useState } from "react";
import RangeSelect from "@/app/_components/Instructor/_shared/RangeSelect";
import type { StatsRange } from "@/server/entities/stats/range";
import { api } from "@/trpc/client";
import CompletionTrendChart from "../CompletionTrendChart";
import EnrollmentsByCourseChart from "../EnrollmentsByCourseChart";
import EnrollmentTrendChart from "../EnrollmentTrendChart";

export default function AnalyticsCharts() {
	const [range, setRange] = useState<StatsRange>("12m");
	const trend = api.analytics.getEnrollmentTrend.useQuery({ range });
	const completion = api.analytics.getCompletionTrend.useQuery({ range });
	const byCourse = api.analytics.getEnrollmentsByCourse.useQuery({ range });

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<RangeSelect onChange={setRange} value={range} />
			</div>
			<EnrollmentTrendChart data={trend.data} isLoading={trend.isLoading} />
			<div className="grid gap-6 lg:grid-cols-2">
				<EnrollmentsByCourseChart data={byCourse.data} isLoading={byCourse.isLoading} />
				<CompletionTrendChart data={completion.data} isLoading={completion.isLoading} />
			</div>
		</div>
	);
}
```

```ts
// app/_components/Instructor/Analytics/components/AnalyticsCharts/types.ts
// No props — this component reads its own data via tRPC.
export type {};
```

> Note: an empty `export type {}` keeps the colocated `types.ts` present without a placeholder type
> (the conventions forbid `Record<string, never>`). The component takes no props, so none are typed.

- [ ] **Step 6: Feature index (RSC)**

```tsx
// app/_components/Instructor/Analytics/index.tsx
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import TopPerformingCourses from "@/app/_components/Instructor/TopPerformingCourses";
import getAnalyticsSummary from "@/lib/requests/instructor/getAnalyticsSummary";
import getTopPerformingCourses from "@/lib/requests/instructor/getTopPerformingCourses";
import AnalyticsCharts from "./components/AnalyticsCharts";
import AnalyticsSummaryCards from "./components/AnalyticsSummaryCards";

export default async function AnalyticsOverview() {
	const [summary, topCourses] = await Promise.all([
		getAnalyticsSummary(),
		getTopPerformingCourses(),
	]);

	return (
		<PageShell
			description="Understand how students discover and engage with your courses."
			title="Analytics"
		>
			<AnalyticsSummaryCards summary={summary} />
			<AnalyticsCharts />
			<TopPerformingCourses courses={topCourses} />
		</PageShell>
	);
}
```

> Verify `getTopPerformingCourses` request helper exists at
> `lib/requests/instructor/getTopPerformingCourses.ts` (it backs the dashboard) and returns the
> shape `TopPerformingCourses` expects; it does (used in `app/instructor/page.tsx`).

- [ ] **Step 7: Replace the route page**

Overwrite `app/instructor/analytics/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import AnalyticsOverview from "@/app/_components/Instructor/Analytics";
import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";

export default async function AnalyticsPage() {
	const session = await getSession();
	if (!session?.user) redirect("/sign-in");
	if (session.user.role !== Role.INSTRUCTOR) redirect("/dashboard");

	return <AnalyticsOverview />;
}
```

> This mirrors the guard in `app/instructor/page.tsx`. (The `instructor` layout may already guard;
> the explicit guard matches the dashboard page and is safe either way.)

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: clean. Then `pnpm dev`, sign in as an instructor, open `/instructor/analytics` — cards,
charts (try each range), and Top Courses render with real data; no console errors.

- [ ] **Step 9: Commit**

```bash
git add app/_components/Instructor/Analytics app/instructor/analytics/page.tsx
git commit -m "feat(analytics): global analytics page"
```

---

## Task 13: Per-course analytics UI + page + card wiring

**Files:**
- Create: `app/_components/Instructor/CourseAnalytics/index.tsx`
- Create: `app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsSummaryCards/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsCharts/{index.tsx,types.ts}`
- Create: `app/_components/Instructor/CourseAnalytics/components/LessonCompletionFunnel/{index.tsx,types.ts}`
- Create: `app/instructor/courses/[courseId]/analytics/page.tsx`
- Modify: `lib/constants/urls/instructorUrls.ts` (add `courseAnalytics`)
- Modify: `app/_components/Course/components/CourseCard/index.tsx:78` (use the constant)

**Interfaces:**
- Consumes: `getCourseAnalyticsSummary`, `api.analytics.getCourseEnrollmentTrend`, `api.analytics.getLessonFunnel`, shared widgets, `EnrollmentTrendChart` (reused from Task 12).

- [ ] **Step 1: Add the URL constant**

In `lib/constants/urls/instructorUrls.ts`, add inside the `INSTRUCTOR_URLS` object (after `editCourse`):

```ts
	courseAnalytics: (id: string) => `${MAIN_URL}/courses/${id}/analytics`,
```

- [ ] **Step 2: Use the constant in the card**

In `app/_components/Course/components/CourseCard/index.tsx`, replace the hardcoded link (line ~78):

```tsx
<Link href={INSTRUCTOR_URLS.courseAnalytics(course.id)}>
```

(`INSTRUCTOR_URLS` is already imported in the file.)

- [ ] **Step 3: Course summary cards (reuse the global card layout)**

```tsx
// app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsSummaryCards/index.tsx
import AnalyticsSummaryCards from "@/app/_components/Instructor/Analytics/components/AnalyticsSummaryCards";
import type { CourseAnalyticsSummaryCardsProps } from "./types";

export default function CourseAnalyticsSummaryCards({ summary }: CourseAnalyticsSummaryCardsProps) {
	return <AnalyticsSummaryCards summary={summary} />;
}
```

```ts
// app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsSummaryCards/types.ts
import type { CourseAnalyticsSummary } from "@/server/entities/analytics/analytics";

export type CourseAnalyticsSummaryCardsProps = { summary: CourseAnalyticsSummary };
```

> The four metrics are identical to the global cards; reusing the component honours DRY. (If the
> per-course cards later diverge, split then — YAGNI now.)

- [ ] **Step 4: Lesson completion funnel**

```tsx
// app/_components/Instructor/CourseAnalytics/components/LessonCompletionFunnel/index.tsx
import { Card } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { LessonCompletionFunnelProps } from "./types";

export default function LessonCompletionFunnel({ lessons }: LessonCompletionFunnelProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Lesson Completion Funnel</h2>
				<p className="text-muted-foreground text-sm">Where students drop off, lesson by lesson</p>
			</div>
			{lessons.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">This course has no lessons yet.</p>
			)}
			{lessons.length > 0 && (
				<ol className="space-y-4">
					{lessons.map((lesson) => {
						const pct = lesson.enrolled === 0 ? 0 : Math.round((lesson.completed / lesson.enrolled) * 100);
						return (
							<li className="flex items-center gap-4" key={lesson.lessonId}>
								<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
									{lesson.order + 1}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-2">
										<span className="truncate font-medium text-sm">{lesson.title}</span>
										<span className="shrink-0 text-muted-foreground text-sm">
											{lesson.completed}/{lesson.enrolled} ({pct}%)
										</span>
									</div>
									<Progress className="mt-2 h-2" value={pct} />
								</div>
							</li>
						);
					})}
				</ol>
			)}
		</Card>
	);
}
```

```ts
// app/_components/Instructor/CourseAnalytics/components/LessonCompletionFunnel/types.ts
import type { LessonFunnelItem } from "@/server/entities/analytics/analytics";

export type LessonCompletionFunnelProps = { lessons: LessonFunnelItem[] };
```

- [ ] **Step 5: Course charts (client, range) — reuses EnrollmentTrendChart**

```tsx
// app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsCharts/index.tsx
"use client";

import { useState } from "react";
import EnrollmentTrendChart from "@/app/_components/Instructor/Analytics/components/EnrollmentTrendChart";
import RangeSelect from "@/app/_components/Instructor/_shared/RangeSelect";
import type { StatsRange } from "@/server/entities/stats/range";
import { api } from "@/trpc/client";
import type { CourseAnalyticsChartsProps } from "./types";

export default function CourseAnalyticsCharts({ courseId }: CourseAnalyticsChartsProps) {
	const [range, setRange] = useState<StatsRange>("12m");
	const trend = api.analytics.getCourseEnrollmentTrend.useQuery({ courseId, range });

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<RangeSelect onChange={setRange} value={range} />
			</div>
			<EnrollmentTrendChart data={trend.data} isLoading={trend.isLoading} />
		</div>
	);
}
```

```ts
// app/_components/Instructor/CourseAnalytics/components/CourseAnalyticsCharts/types.ts
export type CourseAnalyticsChartsProps = { courseId: string };
```

- [ ] **Step 6: Feature index (RSC)**

```tsx
// app/_components/Instructor/CourseAnalytics/index.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { Button } from "@/app/_components/_shared/ui/button";
import getCourseAnalyticsSummary from "@/lib/requests/instructor/getCourseAnalyticsSummary";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { api } from "@/trpc/server";
import CourseAnalyticsCharts from "./components/CourseAnalyticsCharts";
import CourseAnalyticsSummaryCards from "./components/CourseAnalyticsSummaryCards";
import LessonCompletionFunnel from "./components/LessonCompletionFunnel";
import type { CourseAnalyticsProps } from "./types";

export default async function CourseAnalytics({ courseId }: CourseAnalyticsProps) {
	const summary = await getCourseAnalyticsSummary(courseId);
	if (!summary) notFound();

	const lessons = await api.analytics.getLessonFunnel({ courseId });

	return (
		<PageShell
			action={
				<Button asChild variant="outline">
					<Link href={INSTRUCTOR_URLS.courses}>Back to courses</Link>
				</Button>
			}
			description="Engagement and drop-off for this course."
			title="Course Analytics"
		>
			<CourseAnalyticsSummaryCards summary={summary} />
			<CourseAnalyticsCharts courseId={courseId} />
			<LessonCompletionFunnel lessons={lessons} />
		</PageShell>
	);
}
```

```ts
// app/_components/Instructor/CourseAnalytics/types.ts
export type CourseAnalyticsProps = { courseId: string };
```

> `getCourseAnalyticsSummary` returns `null` when the course is not owned (the service throws
> `CourseNotFoundError` → caught in the helper), so `notFound()` covers the IDOR/404 path. The
> `getLessonFunnel` call runs only after ownership is confirmed.

- [ ] **Step 7: Route page**

```tsx
// app/instructor/courses/[courseId]/analytics/page.tsx
import { redirect } from "next/navigation";
import CourseAnalytics from "@/app/_components/Instructor/CourseAnalytics";
import { Role } from "@/generated/prisma";
import { getSession } from "@/server/better-auth/server";

export default async function CourseAnalyticsPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const session = await getSession();
	if (!session?.user) redirect("/sign-in");
	if (session.user.role !== Role.INSTRUCTOR) redirect("/dashboard");

	const { courseId } = await params;
	return <CourseAnalytics courseId={courseId} />;
}
```

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm check`
Expected: clean. Then `pnpm dev`: from `/instructor/courses`, click a course card's chart icon → the
per-course analytics page loads (no 404) with cards, the enrollment chart, and the lesson funnel.
Manually hitting `/instructor/courses/<another-instructor's-id>/analytics` returns 404.

- [ ] **Step 9: Commit**

```bash
git add app/_components/Instructor/CourseAnalytics app/instructor/courses/[courseId]/analytics lib/constants/urls/instructorUrls.ts app/_components/Course/components/CourseCard/index.tsx
git commit -m "feat(analytics): per-course analytics page + card wiring"
```

---

## Self-Review

**Spec coverage (every FR → task):**

| FR | Task |
|----|------|
| FR1 (global route, guard, valid imports, default export) | 12 |
| FR2 (4 summary cards + deltas; avgProgress delta = none, documented) | 8, 12 |
| FR3 (enrollment area chart, range refetch) | 5, 8, 12 |
| FR4 (completion line chart) | 8 (derive), 12 |
| FR5 (enrollments-by-course pie + %) | 6, 8, 12 |
| FR6 (reuse Top Performing Courses) | 12 |
| FR7 (global empty state) | 8 (empty summary), 12 (chart empty states) |
| FR8 (per-course route + ownership, no 404) | 9, 11, 13 |
| FR9 (header + back link) | 13 |
| FR10 (per-course summary cards + deltas) | 9, 13 |
| FR11 (per-course enrollment trend chart) | 9, 13 |
| FR12 (lesson completion funnel) | 6, 9, 13 |
| FR13 (quiz stats) | 4, 8 (quizPassRate card), 13 |
| FR14 (per-course empty state) | 13 (funnel + chart empty states) |
| FR15 (URL constant + card uses it) | 13 |

**Placeholder scan:** none — every code step contains complete, runnable code. The one
`export type {}` (AnalyticsCharts/types.ts) is intentional and explained (no-props convention).

**Type consistency:** `Metric`/`AnalyticsSummary`/`EnrollmentTrendPoint`/`CompletionTrendPoint`/
`EnrollmentsByCourseItem`/`LessonFunnelItem` (Task 3) are used consistently across repo (4-6),
service (8-9), router (10), helpers (11), and UI (12-13). Repo method names
(`getInstructorCourseIds`, `countEnrollments`, `countActiveLearners`, `getAvgProgress`,
`getQuizStats`, `getEnrollmentTrend`, `getEnrollmentsByCourse`, `getLessonCompletions`) match
between their defining task and the service consumers. `StatsRange` flows from Task 1 through
`statsRangeInput` (router) and `RangeSelect` (UI).

**Risk checks (spec.md):** StatCard/DeltaBadge/RangeSelect extraction is a single typecheck-gated
task (2); quiz cross-instructor exclusion is asserted (Task 4 test); previous-period windows reuse
`getMonthWindows` + `computeDelta` (Task 8); chart gaps fixed by `fillBuckets` (Task 7).

## Execution Handoff

Plan complete and saved to `docs/specs/2026-06-19-instructor-analytics/plan.md`. After
`validation.md` is approved, execute with **subagent-driven-development** (fresh subagent per task +
review between tasks) or **executing-plans** (inline, checkpointed). Tasks are ordered to be
independently testable; Tasks 1-2 (shared refactor) must land before the UI tasks.