# Instructor Dashboard — Real Stat Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four hardcoded stat cards on the instructor dashboard with the instructor's real revenue, students, course counts, and average rating, including real month-over-month deltas.

**Architecture:** One aggregating tRPC query (`instructor.getDashboardStats`, `instructorProcedure`) returns a typed `DashboardStats` DTO. `instructorService.getDashboardStats` fans out concurrently to three new repository methods plus the existing `courseRepository.getCoursesStats`, computing deltas with two pure helpers. The dashboard stays a Server Component and renders extracted card sub-components.

**Tech Stack:** Next.js 16 (RSC), tRPC, Prisma, Vitest, TypeScript.

---

## File Structure

**New**
- `lib/stats/monthWindows.ts` — pure: calendar month boundaries for delta windows.
- `lib/stats/monthWindows.test.ts` — unit tests.
- `lib/stats/computeDelta.ts` — pure: current-vs-previous → `StatDelta`.
- `lib/stats/computeDelta.test.ts` — unit tests.
- `server/entities/instructor/dashboard.ts` — `DashboardStats`, `StatDelta` types.
- `lib/requests/instructor/getDashboardStats.ts` — RSC fetch wrapper with zeroed fallback.
- `app/_components/Instructor/DashboardStatsCards/index.tsx` — renders the 4 cards.
- `app/_components/Instructor/DashboardStatsCards/types.ts` — component prop types.

**Modified**
- `server/repositories/payment.repository.ts` — add `getInstructorRevenueStats`.
- `server/repositories/enrollment.repository.ts` — add `getInstructorStudentStats`.
- `server/repositories/courseReview.repository.ts` — add `getInstructorRatingStats`.
- `server/services/instructor/instructor.service.ts` — add `getDashboardStats`.
- `server/services/instructor/instructor.service.test.ts` — new unit test file for the orchestrator.
- `server/api/routers/instructor.ts` — add `getDashboardStats` query.
- `app/instructor/page.tsx` — swap hardcoded cards for `<DashboardStatsCards>`.

---

## Task 1: Month-window helper

Pure date helper used by both revenue and enrollment delta windows. Calendar months in server local time, matching `courseRepository.getCoursesStats`.

**Files:**
- Create: `lib/stats/monthWindows.ts`
- Test: `lib/stats/monthWindows.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/stats/monthWindows.test.ts
import { describe, expect, it } from "vitest";
import { getMonthWindows } from "./monthWindows";

describe("getMonthWindows", () => {
	it("returns this-month start, last-month start, and next-month start", () => {
		const now = new Date(2026, 5, 16); // 2026-06-16 (month index 5 = June)
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 5, 1),
			startLastMonth: new Date(2026, 4, 1),
			startNextMonth: new Date(2026, 6, 1),
		});
	});

	it("handles January (last month is previous December)", () => {
		const now = new Date(2026, 0, 10); // 2026-01-10
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 0, 1),
			startLastMonth: new Date(2025, 11, 1),
			startNextMonth: new Date(2026, 1, 1),
		});
	});

	it("handles December (next month rolls into next January)", () => {
		const now = new Date(2026, 11, 31); // 2026-12-31
		expect(getMonthWindows(now)).toEqual({
			startThisMonth: new Date(2026, 11, 1),
			startLastMonth: new Date(2026, 10, 1),
			startNextMonth: new Date(2027, 0, 1),
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/stats/monthWindows.test.ts`
Expected: FAIL — cannot find module `./monthWindows`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/stats/monthWindows.ts
export type MonthWindows = {
	startThisMonth: Date;
	startLastMonth: Date;
	startNextMonth: Date;
};

/** Calendar-month boundaries (server local time) for month-over-month deltas. */
export function getMonthWindows(now: Date = new Date()): MonthWindows {
	const year = now.getFullYear();
	const month = now.getMonth();
	return {
		startThisMonth: new Date(year, month, 1),
		startLastMonth: new Date(year, month - 1, 1),
		startNextMonth: new Date(year, month + 1, 1),
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/stats/monthWindows.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stats/monthWindows.ts lib/stats/monthWindows.test.ts
git commit -m "feat(instructor-dashboard): add month-window helper for deltas"
```

---

## Task 2: Delta helper

Pure function turning current/previous totals into a `StatDelta`. Implements the FR2/FR4 zero-handling rules.

**Files:**
- Create: `lib/stats/computeDelta.ts`
- Test: `lib/stats/computeDelta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/stats/computeDelta.test.ts
import { describe, expect, it } from "vitest";
import { computeDelta } from "./computeDelta";

describe("computeDelta", () => {
	it("computes a positive percentage when previous > 0", () => {
		expect(computeDelta(110, 100)).toEqual({
			kind: "percent",
			value: 10,
			direction: "up",
		});
	});

	it("computes a negative percentage and rounds to a whole number", () => {
		expect(computeDelta(80, 120)).toEqual({
			kind: "percent",
			value: -33,
			direction: "down",
		});
	});

	it("reports flat when current equals previous", () => {
		expect(computeDelta(100, 100)).toEqual({
			kind: "percent",
			value: 0,
			direction: "flat",
		});
	});

	it("reports 'new' when previous is 0 and current > 0", () => {
		expect(computeDelta(50, 0)).toEqual({ kind: "new" });
	});

	it("reports 'none' when both are 0", () => {
		expect(computeDelta(0, 0)).toEqual({ kind: "none" });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/stats/computeDelta.test.ts`
Expected: FAIL — cannot find module `./computeDelta`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/stats/computeDelta.ts
import type { StatDelta } from "@/server/entities/instructor/dashboard";

/** Month-over-month delta with explicit zero-period handling (FR2/FR4). */
export function computeDelta(current: number, previous: number): StatDelta {
	if (previous === 0) {
		return current > 0 ? { kind: "new" } : { kind: "none" };
	}
	const value = Math.round(((current - previous) / previous) * 100);
	const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
	return { kind: "percent", value, direction };
}
```

> Note: the `StatDelta` import resolves once Task 3 creates the DTO file. Implement Task 3 before running this task's typecheck if executing strictly in order is required; the unit test itself only needs the runtime export. To keep tasks independently runnable, do Task 3 first if your runner typechecks on import.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/stats/computeDelta.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/stats/computeDelta.ts lib/stats/computeDelta.test.ts
git commit -m "feat(instructor-dashboard): add month-over-month delta helper"
```

---

## Task 3: DashboardStats DTO

The shared contract returned by the endpoint and consumed by the UI.

**Files:**
- Create: `server/entities/instructor/dashboard.ts`

- [ ] **Step 1: Create the DTO types**

```ts
// server/entities/instructor/dashboard.ts

/** Month-over-month change for a stat card. */
export type StatDelta =
	| { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
	| { kind: "new" } // prior period 0, current > 0
	| { kind: "none" }; // nothing to compare (both periods 0)

/** All data needed to render the four instructor dashboard stat cards. */
export type DashboardStats = {
	revenue: { totalCents: number; delta: StatDelta };
	students: { total: number; delta: StatDelta };
	courses: { published: number; drafts: number };
	rating: { average: number | null; reviewCount: number };
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (no errors introduced).

- [ ] **Step 3: Commit**

```bash
git add server/entities/instructor/dashboard.ts
git commit -m "feat(instructor-dashboard): add DashboardStats DTO"
```

---

## Task 4: Revenue stats repository method

Lifetime gross + this/last-month gross from `Payment`. Reuses the existing `aggregate` helper.

**Files:**
- Modify: `server/repositories/payment.repository.ts`
- Test: covered by the service unit test (Task 8) and validation integration scenarios.

- [ ] **Step 1: Add the method**

Add inside the `PaymentRepository` class (next to `getOwedBalance`/`getPlatformRevenue`), and import `getMonthWindows` at the top:

```ts
import { getMonthWindows } from "@/lib/stats/monthWindows";
```

```ts
	async getInstructorRevenueStats(instructorId: string): Promise<{
		lifetimeGrossCents: number;
		thisMonthGrossCents: number;
		lastMonthGrossCents: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const base = {
			instructorId,
			status: "succeeded" as const,
			refundedAt: null,
		};

		const [lifetime, thisMonth, lastMonth] = await Promise.all([
			this.aggregate({ where: base, _sum: { amountCents: true } }),
			this.aggregate({
				where: { ...base, createdAt: { gte: startThisMonth, lt: startNextMonth } },
				_sum: { amountCents: true },
			}),
			this.aggregate({
				where: { ...base, createdAt: { gte: startLastMonth, lt: startThisMonth } },
				_sum: { amountCents: true },
			}),
		]);

		return {
			lifetimeGrossCents: lifetime._sum.amountCents ?? 0,
			thisMonthGrossCents: thisMonth._sum.amountCents ?? 0,
			lastMonthGrossCents: lastMonth._sum.amountCents ?? 0,
		};
	}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/payment.repository.ts
git commit -m "feat(instructor-dashboard): add instructor revenue stats query"
```

---

## Task 5: Student stats repository method

Distinct active students across the instructor's courses + new enrollments per month. Uses `groupBy` for the distinct count (no row hydration) and the base `count` for monthly windows.

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`

- [ ] **Step 1: Add the method**

Add the import at the top:

```ts
import { getMonthWindows } from "@/lib/stats/monthWindows";
```

Add inside the `EnrollmentRepository` class:

```ts
	async getInstructorStudentStats(instructorId: string): Promise<{
		total: number;
		thisMonthNew: number;
		lastMonthNew: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const ownedActive = {
			status: EnrollmentStatus.active,
			course: { is: { instructorId, deletedAt: null } },
		} as const;

		const [distinctGroups, thisMonthNew, lastMonthNew] = await Promise.all([
			db.enrollment.groupBy({
				by: ["studentId"],
				where: ownedActive,
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startThisMonth, lt: startNextMonth },
			}),
			this.count({
				...ownedActive,
				enrolledAt: { gte: startLastMonth, lt: startThisMonth },
			}),
		]);

		return { total: distinctGroups.length, thisMonthNew, lastMonthNew };
	}
```

> `db` is already imported in this file; `EnrollmentStatus` is already imported. `count` accepts a `WhereInput` including the `course` relation filter.

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/enrollment.repository.ts
git commit -m "feat(instructor-dashboard): add instructor student stats query"
```

---

## Task 6: Rating stats repository method

Average rating + review count over the instructor's non-deleted reviews.

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`

- [ ] **Step 1: Add the method**

Add inside the `CourseReviewRepository` class (before the closing brace, after `modelName`):

```ts
	async getInstructorRatingStats(instructorId: string): Promise<{
		average: number | null;
		reviewCount: number;
	}> {
		const result = await this.aggregate({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
			},
			_avg: { rating: true },
			_count: { _all: true },
		});

		const reviewCount = result._count._all;
		return {
			average: reviewCount > 0 ? (result._avg.rating ?? null) : null,
			reviewCount,
		};
	}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/repositories/courseReview.repository.ts
git commit -m "feat(instructor-dashboard): add instructor rating stats query"
```

---

## Task 7: Service orchestrator — failing test

Write the unit test for `instructorService.getDashboardStats` first, mocking the four repositories. Mirrors the mocking style in `payment.service.test.ts`.

**Files:**
- Create: `server/services/instructor/instructor.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/services/instructor/instructor.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPaymentRepo = { getInstructorRevenueStats: vi.fn() };
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

const mockEnrollmentRepo = { getInstructorStudentStats: vi.fn() };
vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));

const mockReviewRepo = { getInstructorRatingStats: vi.fn() };
vi.mock("@/server/repositories/courseReview.repository", () => ({
	courseReviewRepository: mockReviewRepo,
}));

const mockCourseRepo = { getCoursesStats: vi.fn() };
vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

import { instructorService } from "./instructor.service";

const INSTRUCTOR_ID = "instructor-1";

describe("InstructorService.getDashboardStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles real stats and computes deltas", async () => {
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 1_245_000,
			thisMonthGrossCents: 110_000,
			lastMonthGrossCents: 100_000,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 1234,
			thisMonthNew: 13,
			lastMonthNew: 12,
		});
		mockReviewRepo.getInstructorRatingStats.mockResolvedValue({
			average: 4.8,
			reviewCount: 245,
		});
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			published: 8,
			draft: 2,
			total: 10,
			lastCourses: 1,
		});

		const result = await instructorService.getDashboardStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			revenue: {
				totalCents: 1_245_000,
				delta: { kind: "percent", value: 10, direction: "up" },
			},
			students: {
				total: 1234,
				delta: { kind: "percent", value: 8, direction: "up" },
			},
			courses: { published: 8, drafts: 2 },
			rating: { average: 4.8, reviewCount: 245 },
		});
	});

	it("returns empty-state values for a brand-new instructor", async () => {
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockReviewRepo.getInstructorRatingStats.mockResolvedValue({
			average: null,
			reviewCount: 0,
		});
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			published: 0,
			draft: 0,
			total: 0,
			lastCourses: 0,
		});

		const result = await instructorService.getDashboardStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			revenue: { totalCents: 0, delta: { kind: "none" } },
			students: { total: 0, delta: { kind: "none" } },
			courses: { published: 0, drafts: 0 },
			rating: { average: null, reviewCount: 0 },
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: FAIL — `getDashboardStats` is not a function.

---

## Task 8: Service orchestrator — implementation

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`

- [ ] **Step 1: Add imports**

At the top of the file, add:

```ts
import { computeDelta } from "@/lib/stats/computeDelta";
import type { DashboardStats } from "@/server/entities/instructor/dashboard";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
```

- [ ] **Step 2: Add the method to `InstructorService`**

```ts
	async getDashboardStats(instructorId: string): Promise<DashboardStats> {
		logger.info("Getting instructor dashboard stats", { instructorId });

		const [revenue, students, rating, courses] = await Promise.all([
			paymentRepository.getInstructorRevenueStats(instructorId),
			enrollmentRepository.getInstructorStudentStats(instructorId),
			courseReviewRepository.getInstructorRatingStats(instructorId),
			courseRepository.getCoursesStats(instructorId),
		]);

		return {
			revenue: {
				totalCents: revenue.lifetimeGrossCents,
				delta: computeDelta(
					revenue.thisMonthGrossCents,
					revenue.lastMonthGrossCents,
				),
			},
			students: {
				total: students.total,
				delta: computeDelta(students.thisMonthNew, students.lastMonthNew),
			},
			courses: { published: courses.published, drafts: courses.draft },
			rating: { average: rating.average, reviewCount: rating.reviewCount },
		};
	}
```

> `logger` is already imported in this file.

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/instructor/instructor.service.ts server/services/instructor/instructor.service.test.ts
git commit -m "feat(instructor-dashboard): aggregate dashboard stats in instructor service"
```

---

## Task 9: tRPC endpoint

Expose the orchestrator as an `instructorProcedure` query.

**Files:**
- Modify: `server/api/routers/instructor.ts`

- [ ] **Step 1: Update the router**

Replace the file contents with:

```ts
import {
	createTRPCRouter,
	instructorProcedure,
	publicProcedure,
} from "@/server/api/trpc";
import { instructorSchema } from "@/server/entities/instructor";
import { instructorService } from "@/server/services/instructor/instructor.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const instructorRouter = createTRPCRouter({
	create: publicProcedure
		.input(instructorSchema)
		.mutation(async ({ input }) => {
			try {
				return await instructorService.createInstructor(input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getDashboardStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getDashboardStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/routers/instructor.ts
git commit -m "feat(instructor-dashboard): expose getDashboardStats tRPC query"
```

---

## Task 10: RSC fetch wrapper

Server-side fetch with a zeroed fallback, mirroring `lib/requests/course/getCoursesStats.ts`.

**Files:**
- Create: `lib/requests/instructor/getDashboardStats.ts`

- [ ] **Step 1: Create the wrapper**

```ts
// lib/requests/instructor/getDashboardStats.ts
import type { DashboardStats } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

const EMPTY_STATS: DashboardStats = {
	revenue: { totalCents: 0, delta: { kind: "none" } },
	students: { total: 0, delta: { kind: "none" } },
	courses: { published: 0, drafts: 0 },
	rating: { average: null, reviewCount: 0 },
};

const getDashboardStats = async (): Promise<DashboardStats> => {
	try {
		return await api.instructor.getDashboardStats();
	} catch (error) {
		console.error("Error fetching instructor dashboard stats:", error);
		return EMPTY_STATS;
	}
};

export default getDashboardStats;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/requests/instructor/getDashboardStats.ts
git commit -m "feat(instructor-dashboard): add RSC fetch wrapper for dashboard stats"
```

---

## Task 11: Stat cards component

Render the four cards from the DTO. Extracted sub-components (`StatCard`, `DeltaBadge`) with early returns — no nested ternaries. Prop types live in `types.ts`.

**Files:**
- Create: `app/_components/Instructor/DashboardStatsCards/types.ts`
- Create: `app/_components/Instructor/DashboardStatsCards/index.tsx`

- [ ] **Step 1: Create `types.ts`**

```ts
// app/_components/Instructor/DashboardStatsCards/types.ts
import type { ReactNode } from "react";
import type {
	DashboardStats,
	StatDelta,
} from "@/server/entities/instructor/dashboard";

export type DashboardStatsCardsProps = {
	stats: DashboardStats;
};

export type StatCardProps = {
	label: string;
	value: string;
	icon: ReactNode;
	iconWrapperClassName: string;
	subline: ReactNode;
};

export type DeltaBadgeProps = {
	delta: StatDelta;
};
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
// app/_components/Instructor/DashboardStatsCards/index.tsx
import { ArrowDownRight, ArrowUpRight, BookOpen, DollarSign, Star, Users } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type {
	DashboardStatsCardsProps,
	DeltaBadgeProps,
	StatCardProps,
} from "./types";

/**
 * USD whole-dollar formatting for revenue. Unlike `lib/formatPrice`, this shows
 * "$0" (not "Free") for zero, which the Total Revenue card requires (FR1).
 */
function formatUsd(cents: number): string {
	return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

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
		return (
			<div className="mt-2 flex items-center gap-1 text-muted-foreground text-sm">
				<span>No change from last month</span>
			</div>
		);
	}
	const isUp = delta.direction === "up";
	const Icon = isUp ? ArrowUpRight : ArrowDownRight;
	return (
		<div
			className={`mt-2 flex items-center gap-1 text-sm ${isUp ? "text-green-600" : "text-red-600"}`}
		>
			<Icon className="h-4 w-4" />
			<span>
				{Math.abs(delta.value)}% from last month
			</span>
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

function RatingSubline({ reviewCount }: { reviewCount: number }) {
	if (reviewCount === 0) {
		return (
			<p className="mt-2 text-muted-foreground text-sm">No reviews yet</p>
		);
	}
	return (
		<div className="mt-2 flex items-center gap-1 text-sm text-yellow-600">
			<Star className="h-4 w-4 fill-yellow-600" />
			<span>{reviewCount} reviews</span>
		</div>
	);
}

export default function DashboardStatsCards({ stats }: DashboardStatsCardsProps) {
	const { revenue, students, courses, rating } = stats;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Total Revenue"
				value={formatUsd(revenue.totalCents)}
				icon={<DollarSign className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				subline={<DeltaBadge delta={revenue.delta} />}
			/>
			<StatCard
				label="Total Students"
				value={students.total.toLocaleString()}
				icon={<Users className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				subline={<DeltaBadge delta={students.delta} />}
			/>
			<StatCard
				label="Active Courses"
				value={courses.published.toLocaleString()}
				icon={<BookOpen className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				subline={
					<p className="mt-2 text-muted-foreground text-sm">
						{courses.drafts} drafts
					</p>
				}
			/>
			<StatCard
				label="Avg. Rating"
				value={rating.average === null ? "—" : rating.average.toFixed(1)}
				icon={<Star className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				subline={<RatingSubline reviewCount={rating.reviewCount} />}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS (Biome may reorder imports/classes — let `pnpm check:write` fix if needed).

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/DashboardStatsCards/
git commit -m "feat(instructor-dashboard): add real stat cards component"
```

---

## Task 12: Wire the dashboard page

Replace the four hardcoded `<Card>` blocks with `<DashboardStatsCards>`. Leave the other three sections untouched (decision #2).

**Files:**
- Modify: `app/instructor/page.tsx`

- [ ] **Step 1: Make the page async and fetch stats**

Change the component signature and add the fetch. The current export is:

```tsx
export default function DashboardPage() {
	return (
```

Replace with:

```tsx
export default async function DashboardPage() {
	const stats = await getDashboardStats();
	return (
```

Add this import alongside the existing imports:

```tsx
import DashboardStatsCards from "@/app/_components/Instructor/DashboardStatsCards";
import getDashboardStats from "@/lib/requests/instructor/getDashboardStats";
```

- [ ] **Step 2: Replace the stats grid**

Delete the entire `{/* Stats Cards */}` block — the `<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">…</div>` containing the four hardcoded `<Card>` elements (`app/instructor/page.tsx:31-103`) — and replace it with:

```tsx
				{/* Stats Cards */}
				<DashboardStatsCards stats={stats} />
```

- [ ] **Step 3: Remove now-unused icon imports**

The four cards no longer use `ArrowUpRight`, `DollarSign`, `Users`, `BookOpen` directly in the page IF they are unused elsewhere in the file. `Users` and `Star` are still used by the "Top Performing Courses" / "Recent Activity" sections; `Eye` and `TrendingUp` remain used. Run `pnpm check` and remove only the icons Biome flags as unused (expected: `ArrowUpRight`, `DollarSign`, `BookOpen`).

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`, sign in as an instructor, open `/instructor`.
Expected: the four cards show real values; a brand-new instructor sees `$0 / 0 / 0 (0 drafts) / —` with no deltas and no errors.

- [ ] **Step 6: Commit**

```bash
git add app/instructor/page.tsx
git commit -m "feat(instructor-dashboard): render real stat cards on dashboard"
```

---

## Task 13: Full verification

- [ ] **Step 1: Run the whole unit suite + typecheck + lint**

Run: `pnpm test:unit && pnpm typecheck && pnpm check`
Expected: all PASS.

- [ ] **Step 2: Confirm no regressions in the dashboard route**

Verify `/instructor` renders for an instructor with data and one without (see validation.md scenarios).

---

## Self-Review Notes

- **Spec coverage:** FR1/FR2 → Tasks 4, 8, 11 (revenue card + delta). FR3/FR4 → Tasks 5, 8, 11 (students card + delta). FR5 → Tasks 8, 11 (reuses `getCoursesStats`). FR6 → Tasks 6, 8, 11 (rating + empty state). FR7 → Tasks 9, 10, 12 (single endpoint, one RSC fetch). FR8 → Task 9 (`instructorProcedure`, session id).
- **Type consistency:** `StatDelta` / `DashboardStats` defined in Task 3, imported by Tasks 2, 8, 10, 11. Repo return shapes (`lifetimeGrossCents`, `thisMonthGrossCents`, `lastMonthGrossCents`, `total`, `thisMonthNew`, `lastMonthNew`, `average`, `reviewCount`, `published`, `draft`) are consistent between Tasks 4/5/6 and their consumption in Task 8.
- **Ordering caveat:** Task 3 (DTO) is a type-only dependency of Tasks 2/8/10/11. If executing strictly in number order with per-task typecheck, the Task 2 note flags doing Task 3 first; otherwise the listed order is fine since the runtime test in Task 2 does not need the type.