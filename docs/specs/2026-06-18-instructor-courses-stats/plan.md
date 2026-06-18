# Real Data for OwnCoursesStats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded "Total Students" and "Total Revenue" cards on `/instructor/courses` with real, instructor-scoped data, reusing the repository aggregates already built for the instructor dashboard.

**Architecture:** `CourseService.getCoursesStats(instructorId)` runs three existing repository aggregates (`courseRepository.getCoursesStats`, `enrollmentRepository.getInstructorStudentStats`, `paymentRepository.getInstructorRevenueStats`) concurrently via `Promise.all` and shapes them into a `CourseOwnerStats` DTO. The `course.getCoursesStats` tRPC procedure calls the service instead of the repository directly. `OwnCoursesStats` extracts a `StatCard` sub-component and renders the two new fields with the page's existing absolute "+N this month" subline style.

**Tech Stack:** Next.js App Router (RSC), tRPC, Prisma, Vitest (unit tests, no DB), Biome.

## Global Constraints

- Instructor id always comes from `ctx.session.user.id` via `instructorProcedure` — never from client input (requirements.md NFR: Security/authz).
- No new database queries beyond the three existing repository methods — reuse only (requirements.md Scope decision #1).
- Sublines use the page's existing absolute-count style (`+N this month`), not the dashboard's percentage `DeltaBadge` (requirements.md Scope decision #2).
- "Total Revenue" = lifetime gross (`SUM(amountCents)`, succeeded, non-refunded), matching the dashboard's definition (requirements.md Scope decision #3).
- Component folders use a colocated `types.ts` for prop types; repeated JSX (3+ uses) is extracted into a named sub-component (CLAUDE.md component conventions, ADR-011).
- This codebase has no router-level tests and no component tests (`.test.tsx`) anywhere — the service layer is the unit-test boundary; router and component changes are verified via `pnpm typecheck` / `pnpm check` and a manual browser check, consistent with existing files (`server/api/routers/course.ts`, `lib/requests/course/getCoursesStats.ts`, `app/_components/Instructor/DashboardStatsCards/`).

---

### Task 1: `CourseService.getCoursesStats` — entity type + service method + unit tests

**Files:**
- Create: `server/entities/course/stats.ts`
- Modify: `server/services/course/course.service.ts`
- Test: `server/services/course/course.service.test.ts` (new)

**Interfaces:**
- Consumes: `courseRepository.getCoursesStats(instructorId): Promise<{ total, draft, published, lastCourses }>` (`server/repositories/course.repository.ts:128`); `enrollmentRepository.getInstructorStudentStats(instructorId): Promise<{ total, thisMonthNew, lastMonthNew }>` (`server/repositories/enrollment.repository.ts:282`); `paymentRepository.getInstructorRevenueStats(instructorId): Promise<{ lifetimeGrossCents, thisMonthGrossCents, lastMonthGrossCents }>` (`server/repositories/payment.repository.ts:56`).
- Produces: `CourseOwnerStats` type (exported from `server/entities/course/stats.ts`); `courseService.getCoursesStats(instructorId: string): Promise<CourseOwnerStats>` — Task 2 (router) calls this directly.

- [ ] **Step 1: Write the failing unit test**

Create `server/services/course/course.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Explicit mock objects per project convention (not vi.hoisted pattern)
const mockCourseRepo = {
	getCoursesStats: vi.fn(),
};
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
};
const mockPaymentRepo = {
	getInstructorRevenueStats: vi.fn(),
};

vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));

vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: mockPaymentRepo,
}));

const { courseService } = await import("./course.service");

const INSTRUCTOR_ID = "instructor-1";

describe("CourseService.getCoursesStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles course, student, and revenue stats into one DTO", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 10,
			draft: 2,
			published: 8,
			lastCourses: 1,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 1234,
			thisMonthNew: 87,
			lastMonthNew: 50,
		});
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 1_245_000,
			thisMonthGrossCents: 123_000,
			lastMonthGrossCents: 100_000,
		});

		const result = await courseService.getCoursesStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			total: 10,
			draft: 2,
			published: 8,
			lastCourses: 1,
			students: { total: 1234, newThisMonth: 87 },
			revenue: { lifetimeGrossCents: 1_245_000, thisMonthGrossCents: 123_000 },
		});
		expect(mockCourseRepo.getCoursesStats).toHaveBeenCalledWith(INSTRUCTOR_ID);
		expect(
			mockEnrollmentRepo.getInstructorStudentStats,
		).toHaveBeenCalledWith(INSTRUCTOR_ID);
		expect(mockPaymentRepo.getInstructorRevenueStats).toHaveBeenCalledWith(
			INSTRUCTOR_ID,
		);
	});

	it("returns zeroed values for a brand-new instructor", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});

		const result = await courseService.getCoursesStats(INSTRUCTOR_ID);

		expect(result).toEqual({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
			students: { total: 0, newThisMonth: 0 },
			revenue: { lifetimeGrossCents: 0, thisMonthGrossCents: 0 },
		});
	});

	it("rejects when a repository call fails", async () => {
		mockCourseRepo.getCoursesStats.mockResolvedValue({
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
		});
		mockEnrollmentRepo.getInstructorStudentStats.mockRejectedValue(
			new Error("DB connection lost"),
		);
		mockPaymentRepo.getInstructorRevenueStats.mockResolvedValue({
			lifetimeGrossCents: 0,
			thisMonthGrossCents: 0,
			lastMonthGrossCents: 0,
		});

		await expect(
			courseService.getCoursesStats(INSTRUCTOR_ID),
		).rejects.toThrow("DB connection lost");
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit course.service.test.ts`
Expected: FAIL — `courseService.getCoursesStats is not a function` (the method doesn't exist yet), or a module-resolution error for `server/entities/course/stats` if you write the import first. Either failure is correct at this point.

- [ ] **Step 3: Create the `CourseOwnerStats` type**

Create `server/entities/course/stats.ts`:

```ts
/** All data needed to render the four "My Courses" stat cards (instructor courses page). */
export type CourseOwnerStats = {
	total: number;
	draft: number;
	published: number;
	lastCourses: number;
	students: {
		total: number;
		newThisMonth: number;
	};
	revenue: {
		lifetimeGrossCents: number;
		thisMonthGrossCents: number;
	};
};
```

- [ ] **Step 4: Implement `CourseService.getCoursesStats`**

In `server/services/course/course.service.ts`, replace the import block (lines 1-16) with:

```ts
import { formatDuration } from "@/lib/format/formatDuration";
import type { Section } from "@/prisma/zod";
import type {
	CourseFullCreateDto,
	CourseFullUpdateDto,
	CourseWithSections,
} from "@/server/entities/course";
import type { CourseOwnerStats } from "@/server/entities/course/stats";
import { courseRepository } from "@/server/repositories/course.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { sectionRepository } from "@/server/repositories/section.repository";
import { CourseError } from "@/server/services/course/course.errors";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { LessonError } from "@/server/services/lesson/lesson.errors";
import { SectionError } from "@/server/services/section/section.errors";
import { vercelService } from "@/server/services/versel/vercel.service";
import { logger } from "@/server/utils/logger";
```

(Only two lines were added — `import type { CourseOwnerStats } from "@/server/entities/course/stats";` and the `enrollmentRepository`/`paymentRepository` imports — slotted alphabetically among the existing ones.)

Add the method to the `CourseService` class (place it after `createCourse`, before `private async createSections`):

```ts
	async getCoursesStats(instructorId: string): Promise<CourseOwnerStats> {
		logger.info("Getting course owner stats", { instructorId });

		const [courses, students, revenue] = await Promise.all([
			courseRepository.getCoursesStats(instructorId),
			enrollmentRepository.getInstructorStudentStats(instructorId),
			paymentRepository.getInstructorRevenueStats(instructorId),
		]);

		return {
			total: courses.total,
			draft: courses.draft,
			published: courses.published,
			lastCourses: courses.lastCourses,
			students: {
				total: students.total,
				newThisMonth: students.thisMonthNew,
			},
			revenue: {
				lifetimeGrossCents: revenue.lifetimeGrossCents,
				thisMonthGrossCents: revenue.thisMonthGrossCents,
			},
		};
	}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:unit course.service.test.ts`
Expected: PASS — all 3 tests in `CourseService.getCoursesStats` pass.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/entities/course/stats.ts server/services/course/course.service.ts server/services/course/course.service.test.ts
git commit -m "feat(course): add CourseService.getCoursesStats combining course, student, and revenue aggregates"
```

---

### Task 2: Wire `course.getCoursesStats` router procedure to the service

**Files:**
- Modify: `server/api/routers/course.ts:97-103`

**Interfaces:**
- Consumes: `courseService.getCoursesStats(instructorId: string): Promise<CourseOwnerStats>` from Task 1.
- Produces: the `course.getCoursesStats` tRPC procedure now returns `CourseOwnerStats` (previously returned the narrower `courseRepository.getCoursesStats` shape) — Task 3 (client request helper) consumes this new shape.

- [ ] **Step 1: Update the procedure**

In `server/api/routers/course.ts`, replace:

```ts
	getCoursesStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await courseRepository.getCoursesStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

with:

```ts
	getCoursesStats: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await courseService.getCoursesStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

`courseService` is already imported in this file (line 9); `courseRepository` (line 8) stays imported because `delete`, `getOwnCourses`, `getOwnCourse`, and `getPublishedCourses` still use it directly.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (This codebase has no router-level test files — `server/api/routers/` is not covered by `*.test.ts`/`*.integration.test.ts` anywhere — so typecheck plus Task 1's service test is the verification for this step.)

- [ ] **Step 3: Commit**

```bash
git add server/api/routers/course.ts
git commit -m "feat(course): route getCoursesStats through CourseService instead of the repository directly"
```

---

### Task 3: Render real Total Students / Total Revenue on `OwnCoursesStats`

**Files:**
- Modify: `lib/requests/course/getCoursesStats.ts`
- Create: `app/_components/Course/components/OwnCoursesStats/types.ts`
- Modify: `app/_components/Course/components/OwnCoursesStats/index.tsx`

**Interfaces:**
- Consumes: `api.course.getCoursesStats(): Promise<CourseOwnerStats>` from Task 2; `formatUsd(cents: number): string` (`lib/formatUsd.ts`, existing — already used by `DashboardStatsCards`).
- Produces: none consumed elsewhere (leaf UI).

- [ ] **Step 1: Update the client request helper's shape and fallback**

Replace the full contents of `lib/requests/course/getCoursesStats.ts`:

```ts
import { api } from "@/trpc/server";

const getCoursesStats = async () => {
	try {
		return await api.course.getCoursesStats(undefined);
	} catch (error) {
		console.error("Error fetching courses stats:", error);
		return {
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
			students: { total: 0, newThisMonth: 0 },
			revenue: { lifetimeGrossCents: 0, thisMonthGrossCents: 0 },
		};
	}
};

export default getCoursesStats;
```

- [ ] **Step 2: Add `types.ts` for the new `StatCard` sub-component**

Create `app/_components/Course/components/OwnCoursesStats/types.ts`:

```ts
export type StatCardProps = {
	label: string;
	value: string | number;
	subline: string;
};
```

- [ ] **Step 3: Extract `StatCard` and render real data**

Replace the full contents of `app/_components/Course/components/OwnCoursesStats/index.tsx`:

```tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import getCoursesStats from "@/lib/requests/course/getCoursesStats";
import type { StatCardProps } from "./types";

function StatCard({ label, value, subline }: StatCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="font-medium text-sm">{label}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="font-bold text-2xl">{value}</div>
				<p className="text-muted-foreground text-xs">{subline}</p>
			</CardContent>
		</Card>
	);
}

const OwnCoursesStats = async () => {
	const { draft, published, total, lastCourses, students, revenue } =
		await getCoursesStats();

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatCard
				label="Total Courses"
				subline={`+${lastCourses} this month`}
				value={total}
			/>
			<StatCard
				label="Published"
				subline={`${draft} drafts`}
				value={published}
			/>
			<StatCard
				label="Total Students"
				subline={`+${students.newThisMonth} enrollments this month`}
				value={students.total}
			/>
			<StatCard
				label="Total Revenue"
				subline={`+${formatUsd(revenue.thisMonthGrossCents)} this month`}
				value={formatUsd(revenue.lifetimeGrossCents)}
			/>
		</div>
	);
};

export default OwnCoursesStats;
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm check`
Expected: no errors. (No component tests exist anywhere in this codebase — `find . -name "*.test.tsx"` returns nothing — so typecheck/lint plus the manual browser check in Step 5 is the verification for this UI change, consistent with how `DashboardStatsCards` was shipped.)

- [ ] **Step 5: Manual verification in the browser**

Run: `pnpm dev`, sign in as an instructor, visit `/instructor/courses`.
Expected:
- "Total Courses" and "Published" cards show the same numbers as before (unchanged).
- "Total Students" shows a real count (0 if the instructor has no students) with a "+N enrollments this month" subline.
- "Total Revenue" shows a real dollar amount (`$0` if no sales) with a "+$N this month" subline.
- For an instructor known to have both students and sales, these two figures match the corresponding "Total Students" / "Total Revenue" cards on `/instructor` (the dashboard).

- [ ] **Step 6: Commit**

```bash
git add lib/requests/course/getCoursesStats.ts app/_components/Course/components/OwnCoursesStats/types.ts app/_components/Course/components/OwnCoursesStats/index.tsx
git commit -m "feat(course): render real Total Students and Total Revenue on the instructor courses page"
```

---

## Self-Review Notes

- **Spec coverage:** FR1–FR4 → Task 3 Step 3 (`StatCard` value/subline wiring). FR5 (zero state) → Task 1 Step 1's second test + Task 3's fallback in Step 1 + manual check in Step 5. FR6 (cross-page consistency) → Task 1 reuses the exact same repository methods as `InstructorService.getDashboardStats`, and Task 3 Step 5 manually cross-checks against `/instructor`. NFR security/authz → Task 2 (`instructorProcedure`, `ctx.session.user.id` unchanged). NFR performance → Task 1 Step 4 (`Promise.all`). NFR reliability → Task 3 Step 1 (fallback object). NFR observability → Task 1 Step 4 (`logger.info`).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `CourseOwnerStats` (Task 1) is consumed identically in Task 2 (router return type, inferred) and Task 3 (destructured fields `draft, published, total, lastCourses, students.{total,newThisMonth}, revenue.{lifetimeGrossCents,thisMonthGrossCents}`) — field names match across all three tasks.