# Student Dashboard — Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded student dashboard (`app/dashboard/page.tsx`) with the student's real Enrolled Courses, Hours Learned, Certificates, Completion Rate, and a working "Continue Learning" list.

**Architecture:** Extend the existing `student` tRPC router + `StudentService` (created by the merged student-progress feature) with two `studentProcedure` queries — `getDashboardStats` and `getContinueLearning` — backed by new aggregation methods on `enrollmentRepository`, `lessonProgressRepository`, and `lessonRepository`. The RSC fetches both via thin `lib/requests/student/*` wrappers that degrade to empty values, alongside the already-dynamic recommendations.

**Tech Stack:** Next.js 16 App Router (RSC), tRPC, Prisma (Postgres, raw SQL via `$queryRaw`), Vitest (unit + integration), Biome, Tailwind + Radix UI, lucide-react icons.

## Global Constraints

- **Three-layer pattern:** router → service → repository. Aggregation lives in repositories, composition in the service, transport/authz in the router.
- **Authz:** both queries are `studentProcedure`; the student id is always `ctx.session.user.id` — never accepted from client input.
- **Component conventions (CLAUDE.md):** every component folder has a colocated `types.ts` (all prop types there, never inline); no nested ternaries in JSX (use early-return sub-components); extract repeated layout into named sub-components; flatten loading/empty states with sequential boolean guards.
- **Reuse, do not recreate:** `lib/stats/statDelta.ts`, `lib/stats/computeDelta.ts`, `lib/stats/monthWindows.ts` (`getMonthWindows`), `enrollmentRepository.getStudentCompletionStats`, `lessonProgressRepository.findCompletedByLessonIds`, and the `student` router / `StudentService` / `lib/requests/student/` directory all already exist. Do not relocate `StatDelta` — it is already in `lib/stats/statDelta.ts`.
- **`StatDelta` shape:** `{ kind: "percent"; value: number; direction: "up"|"down"|"flat" } | { kind: "new" } | { kind: "none" }`. Produced by `computeDelta(current, previous)`.
- **Lint/format:** Biome. Tabs for indentation (match existing files). Run `pnpm check:write` before committing.
- **Tests:** repository methods are verified by `*.integration.test.ts` against `learnix_test` (requires the test DB — see `.env.test.example`); service logic by colocated `*.test.ts` unit tests with mocked repositories.
- **Resume deep-link format:** `/dashboard/courses/${courseId}/learn/${lessonId}` (route exists at `app/dashboard/courses/[courseId]/learn/[lessonId]/page.tsx`).

---

### Task 1: Dashboard entity types

**Files:**
- Create: `server/entities/student/dashboard.ts`

**Interfaces:**
- Consumes: `StatDelta` from `@/lib/stats/statDelta`.
- Produces:
  - `StudentDashboardStats = { enrolledCourses: { total: number; delta: StatDelta }; hoursLearned: { totalMinutes: number; delta: StatDelta }; certificates: { total: number; delta: StatDelta }; completionRate: { percent: number } }`
  - `ContinueLearningItem = { courseId: string; courseTitle: string; progress: number; nextLessonId: string; nextLessonTitle: string }`

- [ ] **Step 1: Create the entity file**

```ts
// server/entities/student/dashboard.ts
import type { StatDelta } from "@/lib/stats/statDelta";

/** Data for the four student dashboard stat cards (FR1–FR7). */
export type StudentDashboardStats = {
	enrolledCourses: { total: number; delta: StatDelta }; // FR1/FR2
	hoursLearned: { totalMinutes: number; delta: StatDelta }; // FR3/FR4 — UI formats minutes → hours
	certificates: { total: number; delta: StatDelta }; // FR5/FR6
	completionRate: { percent: number }; // FR7 — 0..100, no delta
};

/** One row of the "Continue Learning" list (FR10–FR12). */
export type ContinueLearningItem = {
	courseId: string;
	courseTitle: string;
	progress: number; // 0..100, exclusive of both ends (FR10)
	nextLessonId: string; // resume deep-link target (FR12)
	nextLessonTitle: string; // FR11
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add server/entities/student/dashboard.ts
git commit -m "feat(entities): StudentDashboardStats + ContinueLearningItem types"
```

---

### Task 2: `enrollmentRepository.getStudentEnrollmentStats`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts`

**Interfaces:**
- Consumes: `getMonthWindows` (already imported in this file), `EnrollmentStatus` (already imported).
- Produces: `getStudentEnrollmentStats(studentId: string): Promise<{ active: number; total: number; thisMonthNew: number; lastMonthNew: number }>` — `active` = `status = active` (FR1); `total` = all enrollments for the student (FR7 denominator); `thisMonthNew` / `lastMonthNew` bucket by `enrolledAt` (FR2).

- [ ] **Step 1: Write the failing integration test**

Append to `server/repositories/enrollment.repository.integration.test.ts`:

```ts
import { startOfMonth, subDays } from "date-fns";
// NOTE: if these imports already exist at the top of the file, do not duplicate them.

describe("enrollmentRepository.getStudentEnrollmentStats (integration)", () => {
	it("counts active, total, and this/last-month new enrollments by enrolledAt", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const now = new Date();
		const lastMonth = subDays(startOfMonth(now), 5); // safely in the previous month

		const courseA = await makeCourse({ instructorId: instructor.id });
		const courseB = await makeCourse({ instructorId: instructor.id });
		const courseC = await makeCourse({ instructorId: instructor.id });

		// active, enrolled this month
		await makeEnrollment({
			studentId: student.id,
			courseId: courseA.id,
			status: EnrollmentStatus.active,
			enrolledAt: now,
		});
		// active, enrolled last month
		await makeEnrollment({
			studentId: student.id,
			courseId: courseB.id,
			status: EnrollmentStatus.active,
			enrolledAt: lastMonth,
		});
		// cancelled, enrolled this month (counts toward total, not active)
		await makeEnrollment({
			studentId: student.id,
			courseId: courseC.id,
			status: EnrollmentStatus.cancelled,
			enrolledAt: now,
		});

		const stats = await enrollmentRepository.getStudentEnrollmentStats(
			student.id,
		);
		expect(stats).toEqual({
			active: 2,
			total: 3,
			thisMonthNew: 2, // A + C
			lastMonthNew: 1, // B
		});
	});
});
```

Ensure the file imports `EnrollmentStatus`, `Role`, `makeUser`, `makeCourse`, `makeEnrollment`, and `enrollmentRepository` (most already present — add only what is missing).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration enrollment.repository`
Expected: FAIL — `enrollmentRepository.getStudentEnrollmentStats is not a function`.

- [ ] **Step 3: Implement the method**

Add inside `class EnrollmentRepository`, just before the existing `getStudentCompletionStats`:

```ts
	async getStudentEnrollmentStats(studentId: string): Promise<{
		active: number;
		total: number;
		thisMonthNew: number;
		lastMonthNew: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const [active, total, thisMonthNew, lastMonthNew] = await Promise.all([
			this.count({ studentId, status: EnrollmentStatus.active }),
			this.count({ studentId }),
			this.count({
				studentId,
				enrolledAt: { gte: startThisMonth, lt: startNextMonth },
			}),
			this.count({
				studentId,
				enrolledAt: { gte: startLastMonth, lt: startThisMonth },
			}),
		]);
		return { active, total, thisMonthNew, lastMonthNew };
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration enrollment.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(repo): enrollment.getStudentEnrollmentStats"
```

---

### Task 3: `enrollmentRepository.findInProgressForContinue`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts`

**Interfaces:**
- Produces: `findInProgressForContinue(studentId: string, limit: number): Promise<{ courseId: string; courseTitle: string; progress: number }[]>` — enrollments with `0 < progress < 100`, `status = active`, course not soft-deleted, ordered by `lastAccessedAt` desc (nulls last), capped at `limit` (FR10).

- [ ] **Step 1: Write the failing integration test**

Append to `server/repositories/enrollment.repository.integration.test.ts`:

```ts
describe("enrollmentRepository.findInProgressForContinue (integration)", () => {
	it("returns only 0<progress<100 active enrollments, newest lastAccessedAt first, capped", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });

		const inProgressNew = await makeCourse({
			instructorId: instructor.id,
			title: "In Progress New",
		});
		const inProgressOld = await makeCourse({
			instructorId: instructor.id,
			title: "In Progress Old",
		});
		const notStarted = await makeCourse({ instructorId: instructor.id });
		const finished = await makeCourse({ instructorId: instructor.id });

		await makeEnrollment({
			studentId: student.id,
			courseId: inProgressNew.id,
			status: EnrollmentStatus.active,
			progress: 50,
			lastAccessedAt: new Date(2026, 5, 17),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: inProgressOld.id,
			status: EnrollmentStatus.active,
			progress: 80,
			lastAccessedAt: new Date(2026, 5, 10),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: notStarted.id,
			status: EnrollmentStatus.active,
			progress: 0,
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: finished.id,
			status: EnrollmentStatus.active,
			progress: 100,
		});

		const rows = await enrollmentRepository.findInProgressForContinue(
			student.id,
			3,
		);
		expect(rows).toEqual([
			{ courseId: inProgressNew.id, courseTitle: "In Progress New", progress: 50 },
			{ courseId: inProgressOld.id, courseTitle: "In Progress Old", progress: 80 },
		]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration enrollment.repository`
Expected: FAIL — `findInProgressForContinue is not a function`.

- [ ] **Step 3: Implement the method**

Add inside `class EnrollmentRepository`:

```ts
	async findInProgressForContinue(
		studentId: string,
		limit: number,
	): Promise<{ courseId: string; courseTitle: string; progress: number }[]> {
		const rows = await this.findMany({
			where: {
				studentId,
				status: EnrollmentStatus.active,
				progress: { gt: 0, lt: 100 },
				course: { deletedAt: null },
			},
			orderBy: { lastAccessedAt: { sort: "desc", nulls: "last" } },
			take: limit,
			select: {
				progress: true,
				courseId: true,
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => {
			const row = r as {
				progress: number;
				courseId: string;
				course: { title: string };
			};
			return {
				courseId: row.courseId,
				courseTitle: row.course.title,
				progress: row.progress,
			};
		});
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration enrollment.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(repo): enrollment.findInProgressForContinue"
```

---

### Task 4: `lessonProgressRepository.getStudentLessonStats`

**Files:**
- Modify: `server/repositories/lessonProgress.repository.ts`
- Test: `server/repositories/lessonProgress.repository.integration.test.ts`

**Interfaces:**
- Consumes: `getMonthWindows` from `@/lib/stats/monthWindows` (add import).
- Produces: `getStudentLessonStats(studentId: string): Promise<{ lifetimeMinutes: number; thisMonthMinutes: number; lastMonthMinutes: number }>` — sums `Lesson.durationMinutes` over completed lessons, bucketed by `LessonProgress.completedAt` into calendar-month windows (FR3/FR4). Null durations contribute 0.

- [ ] **Step 1: Write the failing integration test**

Append to `server/repositories/lessonProgress.repository.integration.test.ts`:

```ts
describe("lessonProgressRepository.getStudentLessonStats (integration)", () => {
	it("sums durationMinutes for completed lessons, bucketed by completedAt month", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const section = await makeSection({ courseId: course.id });
		const now = new Date();
		const lastMonth = subDays(startOfMonth(now), 5);

		const l30 = await makeLesson({ sectionId: section.id, order: 0, durationMinutes: 30 });
		const lNull = await makeLesson({ sectionId: section.id, order: 1, durationMinutes: null });
		const l60 = await makeLesson({ sectionId: section.id, order: 2, durationMinutes: 60 });
		const l90 = await makeLesson({ sectionId: section.id, order: 3, durationMinutes: 90 });

		await makeLessonProgress({ lessonId: l30.id, studentId: student.id, isCompleted: true, completedAt: now });
		await makeLessonProgress({ lessonId: lNull.id, studentId: student.id, isCompleted: true, completedAt: now });
		await makeLessonProgress({ lessonId: l60.id, studentId: student.id, isCompleted: true, completedAt: lastMonth });
		await makeLessonProgress({ lessonId: l90.id, studentId: student.id, isCompleted: false }); // ignored

		const stats = await lessonProgressRepository.getStudentLessonStats(student.id);
		expect(stats.lifetimeMinutes).toBe(90); // 30 + 0(null) + 60
		expect(stats.thisMonthMinutes).toBe(30);
		expect(stats.lastMonthMinutes).toBe(60);
	});
});
```

Ensure the file imports `startOfMonth`, `subDays` (from `date-fns`), `CourseStatus`, `Role`, `makeCourse`, `makeSection`, `makeLesson`, `makeLessonProgress`, `makeUser` — add any that are missing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lessonProgress.repository`
Expected: FAIL — `getStudentLessonStats is not a function`.

- [ ] **Step 3: Add the import and implement the method**

At the top of `server/repositories/lessonProgress.repository.ts`, add the month-windows import alongside the existing `getWeekWindows` import:

```ts
import { getMonthWindows } from "@/lib/stats/monthWindows";
```

Add inside `class LessonProgressRepository` (after `getCompletedMinutesTotals`):

```ts
	async getStudentLessonStats(studentId: string): Promise<{
		lifetimeMinutes: number;
		thisMonthMinutes: number;
		lastMonthMinutes: number;
	}> {
		const { startThisMonth, startLastMonth, startNextMonth } =
			getMonthWindows();
		const rows = await this.db.$queryRaw<
			[{ lifetime: number; this_month: number; last_month: number }]
		>`
			SELECT
				COALESCE(SUM(l.duration_minutes), 0)::int AS lifetime,
				COALESCE(SUM(l.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startThisMonth}
						AND lp."completedAt" < ${startNextMonth}), 0)::int AS this_month,
				COALESCE(SUM(l.duration_minutes) FILTER (
					WHERE lp."completedAt" >= ${startLastMonth}
						AND lp."completedAt" < ${startThisMonth}), 0)::int AS last_month
			FROM lesson_progress lp
			JOIN lessons l ON l.id = lp."lessonId"
			WHERE lp."studentId" = ${studentId} AND lp."isCompleted" = true
		`;
		const r = rows[0];
		return {
			lifetimeMinutes: Number(r?.lifetime ?? 0),
			thisMonthMinutes: Number(r?.this_month ?? 0),
			lastMonthMinutes: Number(r?.last_month ?? 0),
		};
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lessonProgress.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/lessonProgress.repository.ts server/repositories/lessonProgress.repository.integration.test.ts
git commit -m "feat(repo): lessonProgress.getStudentLessonStats (month-bucketed minutes)"
```

---

### Task 5: `lessonRepository.findOrderedLessonIdsByCourseIds`

**Files:**
- Modify: `server/repositories/lesson.repository.ts`
- Test: `server/repositories/lesson.repository.integration.test.ts` (create if absent)

**Interfaces:**
- Produces: `findOrderedLessonIdsByCourseIds(courseIds: string[]): Promise<{ courseId: string; lessonId: string; title: string }[]>` — non-deleted lessons in non-deleted sections, ordered by `Section.order` then `Lesson.order`; returns `[]` for an empty input.

- [ ] **Step 1: Write the failing integration test**

Create `server/repositories/lesson.repository.integration.test.ts` (or append a `describe` if the file exists):

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { makeCourse, makeLesson, makeSection, makeUser } from "@/test/factories";
import { lessonRepository } from "./lesson.repository";

describe("lessonRepository.findOrderedLessonIdsByCourseIds (integration)", () => {
	it("returns non-deleted lessons ordered by section.order then lesson.order", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: instructor.id });

		const sectionTwo = await makeSection({ courseId: course.id, order: 1, title: "Two" });
		const sectionOne = await makeSection({ courseId: course.id, order: 0, title: "One" });

		const s1l1 = await makeLesson({ sectionId: sectionOne.id, order: 0, title: "S1L1" });
		const s1l2 = await makeLesson({ sectionId: sectionOne.id, order: 1, title: "S1L2" });
		const s2l1 = await makeLesson({ sectionId: sectionTwo.id, order: 0, title: "S2L1" });
		await makeLesson({ sectionId: sectionTwo.id, order: 1, title: "Deleted", deletedAt: new Date() });

		const rows = await lessonRepository.findOrderedLessonIdsByCourseIds([course.id]);
		expect(rows.map((r) => r.lessonId)).toEqual([s1l1.id, s1l2.id, s2l1.id]);
		expect(rows[0]).toEqual({ courseId: course.id, lessonId: s1l1.id, title: "S1L1" });
	});

	it("returns [] for an empty course list", async () => {
		expect(await lessonRepository.findOrderedLessonIdsByCourseIds([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:integration lesson.repository`
Expected: FAIL — `findOrderedLessonIdsByCourseIds is not a function`.

- [ ] **Step 3: Implement the method**

Add inside `class LessonRepository` (after `listOrderedWithConcepts`):

```ts
	async findOrderedLessonIdsByCourseIds(
		courseIds: string[],
	): Promise<{ courseId: string; lessonId: string; title: string }[]> {
		if (courseIds.length === 0) return [];
		const sections = await this.db.section.findMany({
			where: { courseId: { in: courseIds }, deletedAt: null },
			orderBy: { order: "asc" },
			select: {
				courseId: true,
				lessons: {
					where: { deletedAt: null },
					orderBy: { order: "asc" },
					select: { id: true, title: true },
				},
			},
		});
		return sections.flatMap((s) =>
			s.lessons.map((l) => ({
				courseId: s.courseId,
				lessonId: l.id,
				title: l.title,
			})),
		);
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:integration lesson.repository`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/lesson.repository.ts server/repositories/lesson.repository.integration.test.ts
git commit -m "feat(repo): lesson.findOrderedLessonIdsByCourseIds"
```

---

### Task 6: `StudentService.getDashboardStats`

**Files:**
- Modify: `server/services/student/student.service.ts`
- Test: `server/services/student/student.service.test.ts`

**Interfaces:**
- Consumes: `getStudentEnrollmentStats` (Task 2), `getStudentCompletionStats` (existing: `{ total; thisMonthNew; lastMonthNew }`), `getStudentLessonStats` (Task 4), `computeDelta` (existing).
- Produces: `getDashboardStats(studentId: string): Promise<StudentDashboardStats>` (Task 1 type).

- [ ] **Step 1: Write the failing unit test**

In `server/services/student/student.service.test.ts`, add the new repo methods to the existing mocks and add a `describe` block. Update the mock objects at the top of the file to include the new methods:

```ts
const mockLessonProgressRepo = {
	getCompletedMinutesTotals: vi.fn(),
	getDailyCompletedMinutes: vi.fn(),
	getCompletionDays: vi.fn(),
	getStudentLessonStats: vi.fn(),
	findCompletedByLessonIds: vi.fn(),
};
const mockEnrollmentRepo = {
	getStudentCompletionStats: vi.fn(),
	getStudentEnrollmentStats: vi.fn(),
	findInProgressForContinue: vi.fn(),
};
const mockLessonRepo = {
	findOrderedLessonIdsByCourseIds: vi.fn(),
};

vi.mock("@/server/repositories/lesson.repository", () => ({
	lessonRepository: mockLessonRepo,
}));
```

(The existing `vi.mock` calls for lessonProgress and enrollment repositories stay; only the mock objects gain methods. Add the `lesson.repository` mock alongside them.)

Then append:

```ts
describe("StudentService.getDashboardStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("assembles the four cards with month-over-month deltas and completion rate", async () => {
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 5,
			total: 8,
			thisMonthNew: 2,
			lastMonthNew: 1,
		});
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 4,
			thisMonthNew: 1,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getStudentLessonStats.mockResolvedValue({
			lifetimeMinutes: 600,
			thisMonthMinutes: 200,
			lastMonthMinutes: 100,
		});

		const r = await studentService.getDashboardStats(STUDENT_ID);

		expect(r.enrolledCourses).toEqual({
			total: 5,
			delta: { kind: "percent", value: 100, direction: "up" },
		});
		expect(r.hoursLearned).toEqual({
			totalMinutes: 600,
			delta: { kind: "percent", value: 100, direction: "up" },
		});
		expect(r.certificates).toEqual({ total: 4, delta: { kind: "new" } });
		expect(r.completionRate).toEqual({ percent: 50 }); // 4 / 8
	});

	it("returns zeroed values and a 0% rate for a new student", async () => {
		mockEnrollmentRepo.getStudentEnrollmentStats.mockResolvedValue({
			active: 0,
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
			total: 0,
			thisMonthNew: 0,
			lastMonthNew: 0,
		});
		mockLessonProgressRepo.getStudentLessonStats.mockResolvedValue({
			lifetimeMinutes: 0,
			thisMonthMinutes: 0,
			lastMonthMinutes: 0,
		});

		const r = await studentService.getDashboardStats(STUDENT_ID);
		expect(r.enrolledCourses.delta).toEqual({ kind: "none" });
		expect(r.hoursLearned).toEqual({ totalMinutes: 0, delta: { kind: "none" } });
		expect(r.certificates).toEqual({ total: 0, delta: { kind: "none" } });
		expect(r.completionRate).toEqual({ percent: 0 });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit student.service`
Expected: FAIL — `studentService.getDashboardStats is not a function`.

- [ ] **Step 3: Implement the method**

In `server/services/student/student.service.ts`, add the new imports and method. Add to the type import:

```ts
import type {
	StudentProgressStats,
	WeeklyActivityDay,
} from "@/server/entities/student/progress";
import type { StudentDashboardStats } from "@/server/entities/student/dashboard";
import { computeDelta } from "@/lib/stats/computeDelta";
```

(`computeDelta` is already imported — do not duplicate.) Add the method inside `class StudentService`:

```ts
	async getDashboardStats(studentId: string): Promise<StudentDashboardStats> {
		logger.info("Getting student dashboard stats", { studentId });
		const [enrollment, completion, lessons] = await Promise.all([
			enrollmentRepository.getStudentEnrollmentStats(studentId),
			enrollmentRepository.getStudentCompletionStats(studentId),
			lessonProgressRepository.getStudentLessonStats(studentId),
		]);

		const percent =
			enrollment.total === 0
				? 0
				: Math.round((completion.total / enrollment.total) * 100);

		return {
			enrolledCourses: {
				total: enrollment.active,
				delta: computeDelta(enrollment.thisMonthNew, enrollment.lastMonthNew),
			},
			hoursLearned: {
				totalMinutes: lessons.lifetimeMinutes,
				delta: computeDelta(lessons.thisMonthMinutes, lessons.lastMonthMinutes),
			},
			certificates: {
				total: completion.total,
				delta: computeDelta(completion.thisMonthNew, completion.lastMonthNew),
			},
			completionRate: { percent },
		};
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit student.service`
Expected: PASS (both new cases and the existing `getProgressStats` cases).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/services/student/student.service.ts server/services/student/student.service.test.ts
git commit -m "feat(service): StudentService.getDashboardStats"
```

---

### Task 7: `StudentService.getContinueLearning`

**Files:**
- Modify: `server/services/student/student.service.ts`
- Test: `server/services/student/student.service.test.ts`

**Interfaces:**
- Consumes: `findInProgressForContinue` (Task 3), `findOrderedLessonIdsByCourseIds` (Task 5), `findCompletedByLessonIds` (existing: returns rows with `lessonId`).
- Produces: `getContinueLearning(studentId: string, limit?: number): Promise<ContinueLearningItem[]>` — resolves the next incomplete lesson per in-progress course; drops a course with no incomplete lesson (FR10–FR13).

- [ ] **Step 1: Write the failing unit test**

Append to `server/services/student/student.service.test.ts`:

```ts
describe("StudentService.getContinueLearning", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("resolves the first incomplete lesson per in-progress course, preserving order", async () => {
		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValue([
			{ courseId: "c1", courseTitle: "Course One", progress: 50 },
			{ courseId: "c2", courseTitle: "Course Two", progress: 80 },
		]);
		mockLessonRepo.findOrderedLessonIdsByCourseIds.mockResolvedValue([
			{ courseId: "c1", lessonId: "c1l1", title: "C1 L1" },
			{ courseId: "c1", lessonId: "c1l2", title: "C1 L2" },
			{ courseId: "c2", lessonId: "c2l1", title: "C2 L1" },
		]);
		// c1l1 is done → next for c1 is c1l2; nothing done for c2 → next is c2l1
		mockLessonProgressRepo.findCompletedByLessonIds.mockResolvedValue([
			{ lessonId: "c1l1" },
		]);

		const items = await studentService.getContinueLearning(STUDENT_ID);

		expect(items).toEqual([
			{
				courseId: "c1",
				courseTitle: "Course One",
				progress: 50,
				nextLessonId: "c1l2",
				nextLessonTitle: "C1 L2",
			},
			{
				courseId: "c2",
				courseTitle: "Course Two",
				progress: 80,
				nextLessonId: "c2l1",
				nextLessonTitle: "C2 L1",
			},
		]);
	});

	it("drops a course whose every lesson is completed, and returns [] when none in progress", async () => {
		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValueOnce([
			{ courseId: "c1", courseTitle: "Course One", progress: 99 },
		]);
		mockLessonRepo.findOrderedLessonIdsByCourseIds.mockResolvedValueOnce([
			{ courseId: "c1", lessonId: "c1l1", title: "C1 L1" },
		]);
		mockLessonProgressRepo.findCompletedByLessonIds.mockResolvedValueOnce([
			{ lessonId: "c1l1" },
		]);
		expect(await studentService.getContinueLearning(STUDENT_ID)).toEqual([]);

		mockEnrollmentRepo.findInProgressForContinue.mockResolvedValueOnce([]);
		expect(await studentService.getContinueLearning(STUDENT_ID)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit student.service`
Expected: FAIL — `studentService.getContinueLearning is not a function`.

- [ ] **Step 3: Implement the method**

Add imports to `server/services/student/student.service.ts`:

```ts
import type {
	ContinueLearningItem,
	StudentDashboardStats,
} from "@/server/entities/student/dashboard";
import { lessonRepository } from "@/server/repositories/lesson.repository";
```

(Merge `ContinueLearningItem` into the existing `dashboard` type import from Task 6.) Add the method inside `class StudentService`:

```ts
	async getContinueLearning(
		studentId: string,
		limit = 3,
	): Promise<ContinueLearningItem[]> {
		logger.info("Getting student continue-learning list", { studentId });
		const inProgress = await enrollmentRepository.findInProgressForContinue(
			studentId,
			limit,
		);
		if (inProgress.length === 0) return [];

		const courseIds = inProgress.map((e) => e.courseId);
		const orderedLessons =
			await lessonRepository.findOrderedLessonIdsByCourseIds(courseIds);
		const completed = await lessonProgressRepository.findCompletedByLessonIds(
			studentId,
			orderedLessons.map((l) => l.lessonId),
		);
		const completedIds = new Set(
			completed.map((c) => (c as { lessonId: string }).lessonId),
		);

		const lessonsByCourse = new Map<
			string,
			{ lessonId: string; title: string }[]
		>();
		for (const l of orderedLessons) {
			const list = lessonsByCourse.get(l.courseId) ?? [];
			list.push({ lessonId: l.lessonId, title: l.title });
			lessonsByCourse.set(l.courseId, list);
		}

		const items: ContinueLearningItem[] = [];
		for (const e of inProgress) {
			const lessons = lessonsByCourse.get(e.courseId) ?? [];
			const next = lessons.find((l) => !completedIds.has(l.lessonId));
			if (!next) continue; // no incomplete lesson → drop (FR-risk row)
			items.push({
				courseId: e.courseId,
				courseTitle: e.courseTitle,
				progress: e.progress,
				nextLessonId: next.lessonId,
				nextLessonTitle: next.title,
			});
		}
		return items;
	}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit student.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/services/student/student.service.ts server/services/student/student.service.test.ts
git commit -m "feat(service): StudentService.getContinueLearning"
```

---

### Task 8: Router queries + RSC request wrappers

**Files:**
- Modify: `server/api/routers/student.ts`
- Create: `lib/requests/student/getDashboardStats.ts`
- Create: `lib/requests/student/getContinueLearning.ts`

**Interfaces:**
- Consumes: `studentService.getDashboardStats` / `getContinueLearning` (Tasks 6–7), `api.student.*` from `@/trpc/server`.
- Produces: `api.student.getDashboardStats` / `api.student.getContinueLearning` tRPC queries; default-exported async wrappers `getDashboardStats()` / `getContinueLearning()` that degrade to zeroed stats / `[]`.

- [ ] **Step 1: Add the two queries to the existing router**

In `server/api/routers/student.ts`, add inside `createTRPCRouter({ ... })` after `getProgressStats`:

```ts
	getDashboardStats: studentProcedure.query(async ({ ctx }) => {
		try {
			return await studentService.getDashboardStats(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
	getContinueLearning: studentProcedure.query(async ({ ctx }) => {
		try {
			return await studentService.getContinueLearning(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

- [ ] **Step 2: Create the dashboard-stats RSC wrapper**

```ts
// lib/requests/student/getDashboardStats.ts
import type { StudentDashboardStats } from "@/server/entities/student/dashboard";
import { api } from "@/trpc/server";

const EMPTY: StudentDashboardStats = {
	enrolledCourses: { total: 0, delta: { kind: "none" } },
	hoursLearned: { totalMinutes: 0, delta: { kind: "none" } },
	certificates: { total: 0, delta: { kind: "none" } },
	completionRate: { percent: 0 },
};

const getDashboardStats = async (): Promise<StudentDashboardStats> => {
	try {
		return await api.student.getDashboardStats();
	} catch (error) {
		console.error("Error fetching student dashboard stats:", error);
		return EMPTY;
	}
};

export default getDashboardStats;
```

- [ ] **Step 3: Create the continue-learning RSC wrapper**

```ts
// lib/requests/student/getContinueLearning.ts
import type { ContinueLearningItem } from "@/server/entities/student/dashboard";
import { api } from "@/trpc/server";

const getContinueLearning = async (): Promise<ContinueLearningItem[]> => {
	try {
		return await api.student.getContinueLearning();
	} catch (error) {
		console.error("Error fetching continue-learning list:", error);
		return [];
	}
};

export default getContinueLearning;
```

- [ ] **Step 4: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/api/routers/student.ts lib/requests/student/getDashboardStats.ts lib/requests/student/getContinueLearning.ts
git commit -m "feat(api): student.getDashboardStats + getContinueLearning queries and RSC wrappers"
```

---

### Task 9: `DashboardStatsCards` component

**Files:**
- Create: `app/_components/Dashboard/StatsCards/index.tsx`
- Create: `app/_components/Dashboard/StatsCards/types.ts`

**Interfaces:**
- Consumes: `StudentDashboardStats` (Task 1), `StatDelta`, shared `Card*` UI primitives.
- Produces: default-exported `DashboardStatsCards` rendering Enrolled Courses, Hours Learned, Certificates, Completion Rate.

- [ ] **Step 1: Create `types.ts`**

```ts
// app/_components/Dashboard/StatsCards/types.ts
import type { ReactNode } from "react";
import type { StatDelta } from "@/lib/stats/statDelta";
import type { StudentDashboardStats } from "@/server/entities/student/dashboard";

export type DashboardStatsCardsProps = { stats: StudentDashboardStats };

export type StatCardProps = {
	label: string;
	value: string;
	icon: ReactNode;
	subline: ReactNode;
};

export type DeltaBadgeProps = { delta: StatDelta };
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
// app/_components/Dashboard/StatsCards/index.tsx
import { Award, BookOpen, Clock, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type {
	DashboardStatsCardsProps,
	DeltaBadgeProps,
	StatCardProps,
} from "./types";

function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new")
		return <p className="text-muted-foreground text-xs">New this month</p>;
	if (delta.value === -100)
		return <p className="text-muted-foreground text-xs">None this month</p>;
	if (delta.direction === "flat")
		return <p className="text-muted-foreground text-xs">No change</p>;
	const sign = delta.direction === "up" ? "+" : "−";
	return (
		<p className="text-muted-foreground text-xs">
			{sign}
			{Math.abs(delta.value)}% from last month
		</p>
	);
}

function StatCard({ label, value, icon, subline }: StatCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="font-medium text-sm">{label}</CardTitle>
				{icon}
			</CardHeader>
			<CardContent>
				<div className="font-bold text-2xl">{value}</div>
				{subline}
			</CardContent>
		</Card>
	);
}

function hours(minutes: number): string {
	return (Math.round((minutes / 60) * 10) / 10).toString();
}

export default function DashboardStatsCards({
	stats,
}: DashboardStatsCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
				label="Enrolled Courses"
				subline={<DeltaBadge delta={stats.enrolledCourses.delta} />}
				value={stats.enrolledCourses.total.toString()}
			/>
			<StatCard
				icon={<Clock className="h-4 w-4 text-muted-foreground" />}
				label="Hours Learned"
				subline={<DeltaBadge delta={stats.hoursLearned.delta} />}
				value={hours(stats.hoursLearned.totalMinutes)}
			/>
			<StatCard
				icon={<Award className="h-4 w-4 text-muted-foreground" />}
				label="Certificates"
				subline={<DeltaBadge delta={stats.certificates.delta} />}
				value={stats.certificates.total.toString()}
			/>
			<StatCard
				icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
				label="Completion Rate"
				subline={
					<p className="text-muted-foreground text-xs">Across enrolled courses</p>
				}
				value={`${stats.completionRate.percent}%`}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
pnpm check:write
git add app/_components/Dashboard/StatsCards/
git commit -m "feat(ui): student dashboard stat cards"
```

---

### Task 10: `ContinueLearning` component

**Files:**
- Create: `app/_components/Dashboard/ContinueLearning/index.tsx`
- Create: `app/_components/Dashboard/ContinueLearning/types.ts`

**Interfaces:**
- Consumes: `ContinueLearningItem[]` (Task 1), shared `Card*` UI primitives, `next/link`.
- Produces: default-exported `ContinueLearning` rendering up to 3 resume links, or an empty state (FR13).

- [ ] **Step 1: Create `types.ts`**

```ts
// app/_components/Dashboard/ContinueLearning/types.ts
import type { ContinueLearningItem } from "@/server/entities/student/dashboard";

export type ContinueLearningProps = { items: ContinueLearningItem[] };

export type ContinueLearningRowProps = { item: ContinueLearningItem };
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
// app/_components/Dashboard/ContinueLearning/index.tsx
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { ContinueLearningProps, ContinueLearningRowProps } from "./types";

function ContinueLearningRow({ item }: ContinueLearningRowProps) {
	return (
		<Link
			className="block space-y-2 rounded-md p-2 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
			href={`/dashboard/courses/${item.courseId}/learn/${item.nextLessonId}`}
		>
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium">{item.courseTitle}</p>
					<p className="text-muted-foreground text-sm">{item.nextLessonTitle}</p>
				</div>
				<span className="font-medium text-sm">{item.progress}%</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-secondary">
				<div
					className="h-full bg-primary transition-all"
					style={{ width: `${item.progress}%` }}
				/>
			</div>
		</Link>
	);
}

export default function ContinueLearning({ items }: ContinueLearningProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Continue Learning</CardTitle>
				<CardDescription>Pick up where you left off</CardDescription>
			</CardHeader>
			<CardContent>
				{items.length === 0 && (
					<p className="text-muted-foreground text-sm">
						No courses in progress yet. Browse the catalog to get started.
					</p>
				)}
				{items.length > 0 && (
					<div className="space-y-2">
						{items.map((item) => (
							<ContinueLearningRow item={item} key={item.courseId} />
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
pnpm check:write
git add app/_components/Dashboard/ContinueLearning/
git commit -m "feat(ui): student Continue Learning list with resume links + empty state"
```

---

### Task 11: Wire the dashboard page to real data

**Files:**
- Modify: `app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getDashboardStats` / `getContinueLearning` (Task 8), `DashboardStatsCards` (Task 9), `ContinueLearning` (Task 10), existing `getRecommendations` + `RecommendedRail`.

- [ ] **Step 1: Replace the page body with real data**

Rewrite `app/dashboard/page.tsx` to:

```tsx
import { redirect } from "next/navigation";

import ContinueLearning from "@/app/_components/Dashboard/ContinueLearning";
import DashboardStatsCards from "@/app/_components/Dashboard/StatsCards";
import RecommendedRail from "@/app/_components/Course/components/RecommendedRail";
import { Role } from "@/generated/prisma";
import ADMIN_URLS from "@/lib/constants/urls/adminUrls";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getContinueLearning from "@/lib/requests/student/getContinueLearning";
import getDashboardStats from "@/lib/requests/student/getDashboardStats";
import { getSession } from "@/server/better-auth/server";
import { getRecommendations } from "./actions/getRecommendations";

export default async function DashboardPage() {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	if (session.user.role === Role.INSTRUCTOR) {
		redirect(INSTRUCTOR_URLS.dashboard);
	}

	if (session.user.role === Role.ADMIN) {
		redirect(ADMIN_URLS.dashboard);
	}

	const [stats, continueLearning, recommendations] = await Promise.all([
		getDashboardStats(),
		getContinueLearning(),
		getRecommendations(),
	]);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Dashboard</h1>
				<p className="text-muted-foreground">
					Welcome back! Here's your learning progress
				</p>
			</div>

			<DashboardStatsCards stats={stats} />
			<ContinueLearning items={continueLearning} />
			<RecommendedRail courses={recommendations} />
		</div>
	);
}
```

This removes the hardcoded stat cards, the fabricated Continue Learning list, and the now-unused `Card*`/lucide imports.

- [ ] **Step 2: Verify it typechecks and lints**

Run: `pnpm typecheck && pnpm check`
Expected: PASS (no unused-import errors).

- [ ] **Step 3: Manual verification (dev server)**

Run: `pnpm dev`, sign in as a student with at least one in-progress enrollment, open `/dashboard`. Confirm:
- The four cards show real numbers (cross-check against Prisma Studio: `pnpm db:studio`).
- Continue Learning lists in-progress courses; clicking one lands on `/dashboard/courses/<id>/learn/<lessonId>`.
- A brand-new student account shows `0` / `0` / `0` / `0%`, no deltas, and the empty-state copy.

- [ ] **Step 4: Commit**

```bash
pnpm check:write
git add app/dashboard/page.tsx
git commit -m "feat(dashboard): render real student dashboard data"
```

---

## Final verification

- [ ] Run the full unit suite: `pnpm test:unit` → PASS.
- [ ] Run the integration suite (needs `learnix_test`): `pnpm test:integration` → PASS.
- [ ] `pnpm typecheck` → PASS.
- [ ] `pnpm check` → PASS.

## Self-review notes (spec coverage)

- FR1/FR2 → Tasks 2 (`getStudentEnrollmentStats`) + 6 (`enrolledCourses`) + 9 (card).
- FR3/FR4 → Tasks 4 (`getStudentLessonStats`) + 6 (`hoursLearned`) + 9 (Hours Learned card, `hours()` formatter).
- FR5/FR6 → existing `getStudentCompletionStats` + Tasks 6 (`certificates`) + 9 (card).
- FR7 → Task 6 (`completionRate` = completed/total, 0% when total 0) + 9 (static subline, no delta).
- FR8 → Task 11 (single `Promise.all` fetch in the RSC).
- FR9 → Task 8 (`studentProcedure`, id from `ctx.session.user.id`).
- FR10/FR11/FR12 → Tasks 3 + 5 + 7 (`getContinueLearning`) + 10 (rows + resume links).
- FR13 → Task 10 (empty-state branch).
- Zero-data handling → `computeDelta` (`new`/`none`) exercised in the Task 6 "new student" test and the Task 10 empty state.