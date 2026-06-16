# Instructor Dashboard — Top Performing Courses & Recent Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hardcoded instructor-dashboard widgets ("Top Performing Courses" and "Recent Activity", `app/instructor/page.tsx:34-147`) with real, per-instructor data.

**Architecture:** Two read-only `instructorProcedure` queries (`getTopPerformingCourses`, `getRecentActivity`) → two `instructorService` orchestrators → repository aggregates (reusing the existing `paymentRepository.getRevenueGroupedByCourse` for revenue ranking + new batched count/rating/recent-rows methods). The page stays a Server Component, fetching both DTOs via `lib/requests/instructor/*` helpers (each with a `[]` fallback for per-widget error isolation) inside one `Promise.all`, feeding two new island components.

**Tech Stack:** Next.js 16 RSC, tRPC, Prisma, Vitest (unit + integration against `learnix_test`), date-fns, Biome.

See [`requirements.md`](./requirements.md), [`spec.md`](./spec.md).

---

## File Structure

**New**
- `lib/utils/date/relativeTime.ts` — `relativeTimeLabel(date)` → human relative string.
- `lib/requests/instructor/getTopPerformingCourses.ts` — RSC fetch wrapper, `[]` fallback.
- `lib/requests/instructor/getRecentActivity.ts` — RSC fetch wrapper, `[]` fallback.
- `app/_components/Instructor/TopPerformingCourses/{index.tsx,types.ts}` — card UI.
- `app/_components/Instructor/RecentActivity/{index.tsx,types.ts}` — card UI.

**Modified**
- `server/entities/instructor/dashboard.ts` — append `TopCourse`, `ActivityEvent`.
- `server/repositories/course.repository.ts` — add `getCourseCardsByIds`.
- `server/repositories/courseReview.repository.ts` — add `getAvgRatingByCourseIds`, `findRecentByInstructor`.
- `server/repositories/enrollment.repository.ts` — add `findRecentByInstructor`.
- `server/services/instructor/instructor.service.ts` — add `getTopPerformingCourses`, `getRecentActivity`.
- `server/api/routers/instructor.ts` — add the two queries.
- `app/instructor/page.tsx` — swap the two `<Card>` blocks for the new components; single `Promise.all`.

> **Note:** No new `paymentRepository` method is needed — `getRevenueGroupedByCourse(instructorId, since, limit)` already returns course IDs ranked by gross revenue desc. The service passes `new Date(0)` as `since` for a lifetime window.

---

## Task 1: DTOs — `TopCourse` and `ActivityEvent`

**Files:**
- Modify: `server/entities/instructor/dashboard.ts`

Type-only change; verified by `pnpm typecheck` (no runtime test).

- [ ] **Step 1: Append the two DTOs to the existing file**

Add to the bottom of `server/entities/instructor/dashboard.ts`:

```ts
/** One row of the "Top Performing Courses" card (FR1, FR2). */
export type TopCourse = {
	courseId: string;
	title: string;
	students: number; // active enrollments = distinct students (FR4)
	rating: number | null; // avg review rating; null = no reviews yet → "—" (FR5)
	grossCents: number; // lifetime gross revenue, ranking key (FR2)
};

/** One entry in the "Recent Activity" feed (FR7–FR10). Discriminated by `type`. */
export type ActivityEvent =
	| {
			type: "enrollment";
			id: string; // enrollment id (stable React key)
			studentName: string;
			courseTitle: string;
			occurredAt: Date; // Enrollment.enrolledAt
	  }
	| {
			type: "review";
			id: string; // review id
			studentName: string;
			courseTitle: string;
			rating: number; // 1..5
			occurredAt: Date; // CourseReview.createdAt
	  };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add server/entities/instructor/dashboard.ts
git commit -m "feat(dashboard): add TopCourse and ActivityEvent DTOs"
```

---

## Task 2: `relativeTimeLabel` date util

**Files:**
- Create: `lib/utils/date/relativeTime.ts`
- Test: `lib/utils/date/relativeTime.test.ts`

Mirrors the existing `lib/utils/date/updatedLabel.ts` pattern.

- [ ] **Step 1: Write the failing test**

Create `lib/utils/date/relativeTime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import relativeTimeLabel from "./relativeTime";

describe("relativeTimeLabel", () => {
	it("renders a past distance with an 'ago' suffix", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
		expect(relativeTimeLabel(tenMinutesAgo)).toContain("ago");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/utils/date/relativeTime.test.ts`
Expected: FAIL — cannot resolve `./relativeTime`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/utils/date/relativeTime.ts`:

```ts
import { formatDistanceToNow } from "date-fns";

/** Human relative timestamp, e.g. "2 hours ago". */
const relativeTimeLabel = (date: Date): string =>
	formatDistanceToNow(date, { addSuffix: true });

export default relativeTimeLabel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/utils/date/relativeTime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/date/relativeTime.ts lib/utils/date/relativeTime.test.ts
git commit -m "feat(dashboard): add relativeTimeLabel date util"
```

---

## Task 3: `courseRepository.getCourseCardsByIds`

**Files:**
- Modify: `server/repositories/course.repository.ts`
- Test: `server/repositories/course.repository.integration.test.ts` (create if absent)

Returns `Map<courseId, { title, students }>` where `students` is the count of **active** enrollments (= distinct students, given the `@@unique([studentId, courseId])` constraint). Filters by instructor ownership and `deletedAt: null` so soft-deleted courses drop out.

- [ ] **Step 1: Write the failing integration test**

Create or append to `server/repositories/course.repository.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { courseRepository } from "./course.repository";

describe("CourseRepository.getCourseCardsByIds", () => {
	it("returns title and active-student count, scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Owned Course",
			status: CourseStatus.published,
		});
		const foreign = await makeCourse({
			instructorId: other.id,
			status: CourseStatus.published,
		});

		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		await makeEnrollment({ studentId: s2.id, courseId: course.id });
		await makeEnrollment({
			studentId: s3.id,
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
		});

		const map = await courseRepository.getCourseCardsByIds(instructor.id, [
			course.id,
			foreign.id,
		]);

		expect(map.get(course.id)).toEqual({ title: "Owned Course", students: 2 });
		expect(map.has(foreign.id)).toBe(false); // not owned by instructor
	});

	it("returns an empty map for no ids", async () => {
		const map = await courseRepository.getCourseCardsByIds("x", []);
		expect(map.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: FAIL — `getCourseCardsByIds is not a function`.

- [ ] **Step 3: Add `EnrollmentStatus` to the imports**

In `server/repositories/course.repository.ts`, change the first import:

```ts
import {
	type Course,
	CourseStatus,
	EnrollmentStatus,
	type Prisma,
} from "@/generated/prisma";
```

- [ ] **Step 4: Implement the method**

Add inside the `CourseRepository` class (e.g. after `findManyByIdsPreservingOrder`):

```ts
	async getCourseCardsByIds(
		instructorId: string,
		courseIds: string[],
	): Promise<Map<string, { title: string; students: number }>> {
		if (courseIds.length === 0) return new Map();
		const courses = await this.findMany({
			where: { id: { in: courseIds }, instructorId, deletedAt: null },
			select: {
				id: true,
				title: true,
				_count: {
					select: {
						enrollments: { where: { status: EnrollmentStatus.active } },
					},
				},
			},
		});
		return new Map(
			courses.map((c) => [
				c.id,
				{ title: c.title, students: c._count.enrollments },
			]),
		);
	}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/repositories/course.repository.ts server/repositories/course.repository.integration.test.ts
git commit -m "feat(dashboard): add courseRepository.getCourseCardsByIds"
```

---

## Task 4: `courseReviewRepository.getAvgRatingByCourseIds`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts` (create)

Returns `Map<courseId, number | null>` of average rating per course, ignoring soft-deleted reviews.

- [ ] **Step 1: Write the failing integration test**

Create `server/repositories/courseReview.repository.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { courseReviewRepository } from "./courseReview.repository";

async function makeReview(args: {
	courseId: string;
	studentId: string;
	rating: number;
	deletedAt?: Date | null;
}) {
	return testDb.courseReview.create({
		data: {
			courseId: args.courseId,
			studentId: args.studentId,
			rating: args.rating,
			comment: "ok",
			deletedAt: args.deletedAt ?? null,
		},
	});
}

describe("CourseReviewRepository.getAvgRatingByCourseIds", () => {
	it("averages non-deleted reviews per course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 5 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 3 });
		await makeReview({
			courseId: course.id,
			studentId: s3.id,
			rating: 1,
			deletedAt: new Date(),
		});

		const map = await courseReviewRepository.getAvgRatingByCourseIds([
			course.id,
		]);
		expect(map.get(course.id)).toBe(4); // (5 + 3) / 2, deleted ignored
	});

	it("omits courses with no reviews", async () => {
		const map = await courseReviewRepository.getAvgRatingByCourseIds([
			"no-such-course",
		]);
		expect(map.has("no-such-course")).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: FAIL — `getAvgRatingByCourseIds is not a function`.

- [ ] **Step 3: Add the `db` import**

At the top of `server/repositories/courseReview.repository.ts`, add:

```ts
import { db } from "@/server/db";
```

- [ ] **Step 4: Implement the method**

Add inside the `CourseReviewRepository` class:

```ts
	async getAvgRatingByCourseIds(
		courseIds: string[],
	): Promise<Map<string, number | null>> {
		if (courseIds.length === 0) return new Map();
		const grouped = await db.courseReview.groupBy({
			by: ["courseId"],
			where: { courseId: { in: courseIds }, deletedAt: null },
			_avg: { rating: true },
		});
		return new Map(grouped.map((g) => [g.courseId, g._avg.rating]));
	}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/repositories/courseReview.repository.ts server/repositories/courseReview.repository.integration.test.ts
git commit -m "feat(dashboard): add courseReviewRepository.getAvgRatingByCourseIds"
```

---

## Task 5: `enrollmentRepository.findRecentByInstructor`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts` (create)

Returns the N most-recent **active** enrollments on the instructor's non-deleted courses, flattened to `{ id, studentName, courseTitle, enrolledAt }`.

- [ ] **Step 1: Write the failing integration test**

Create `server/repositories/enrollment.repository.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { makeCourse, makeEnrollment, makeUser } from "@/test/factories";
import { enrollmentRepository } from "./enrollment.repository";

describe("EnrollmentRepository.findRecentByInstructor", () => {
	it("returns newest-first rows with student name and course title", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "My Course",
			status: CourseStatus.published,
		});
		const older = await makeUser({ role: Role.STUDENT, name: "Older Student" });
		const newer = await makeUser({ role: Role.STUDENT, name: "Newer Student" });
		await makeEnrollment({
			studentId: older.id,
			courseId: course.id,
			enrolledAt: new Date("2026-01-01T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: newer.id,
			courseId: course.id,
			enrolledAt: new Date("2026-02-01T00:00:00Z"),
		});

		const rows = await enrollmentRepository.findRecentByInstructor(
			instructor.id,
			5,
		);

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			studentName: "Newer Student",
			courseTitle: "My Course",
		});
		expect(rows[1]?.studentName).toBe("Older Student");
	});

	it("excludes other instructors' enrollments", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const foreign = await makeCourse({
			instructorId: other.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: student.id, courseId: foreign.id });

		const rows = await enrollmentRepository.findRecentByInstructor(
			instructor.id,
			5,
		);
		expect(rows).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts`
Expected: FAIL — `findRecentByInstructor is not a function`.

- [ ] **Step 3: Implement the method**

Add inside the `EnrollmentRepository` class (`EnrollmentStatus` is already imported):

```ts
	async findRecentByInstructor(
		instructorId: string,
		take: number,
	): Promise<
		{
			id: string;
			studentName: string;
			courseTitle: string;
			enrolledAt: Date;
		}[]
	> {
		const rows = await this.findMany({
			where: {
				status: EnrollmentStatus.active,
				course: { is: { instructorId, deletedAt: null } },
			},
			orderBy: { enrolledAt: "desc" },
			take,
			select: {
				id: true,
				enrolledAt: true,
				student: { select: { name: true } },
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			courseTitle: r.course.title,
			enrolledAt: r.enrolledAt,
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(dashboard): add enrollmentRepository.findRecentByInstructor"
```

---

## Task 6: `courseReviewRepository.findRecentByInstructor`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts` (append)

Returns the N most-recent non-deleted reviews on the instructor's non-deleted courses, flattened to `{ id, studentName, courseTitle, rating, createdAt }`.

- [ ] **Step 1: Append the failing integration test**

Append to `server/repositories/courseReview.repository.integration.test.ts` (reuse the `makeReview` helper already defined in that file; if running this task standalone, the helper from Task 4 must exist):

```ts
import { makeEnrollment } from "@/test/factories";

describe("CourseReviewRepository.findRecentByInstructor", () => {
	it("returns newest-first reviews scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Reviewed Course",
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT, name: "Reviewer One" });
		const s2 = await makeUser({ role: Role.STUDENT, name: "Reviewer Two" });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 4 });
		await makeReview({ courseId: course.id, studentId: s2.id, rating: 5 });

		const rows = await courseReviewRepository.findRecentByInstructor(
			instructor.id,
			5,
		);

		expect(rows.length).toBe(2);
		expect(rows[0]).toMatchObject({ courseTitle: "Reviewed Course" });
		expect(typeof rows[0]?.rating).toBe("number");
		expect(typeof rows[0]?.studentName).toBe("string");
	});
});
```

> The `makeEnrollment` import is harmless if unused; remove it if Biome flags it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: FAIL — `findRecentByInstructor is not a function`.

- [ ] **Step 3: Implement the method**

Add inside the `CourseReviewRepository` class:

```ts
	async findRecentByInstructor(
		instructorId: string,
		take: number,
	): Promise<
		{
			id: string;
			studentName: string;
			courseTitle: string;
			rating: number;
			createdAt: Date;
		}[]
	> {
		const rows = await this.findMany({
			where: {
				deletedAt: null,
				course: { is: { instructorId, deletedAt: null } },
			},
			orderBy: { createdAt: "desc" },
			take,
			select: {
				id: true,
				rating: true,
				createdAt: true,
				student: { select: { name: true } },
				course: { select: { title: true } },
			},
		});
		return rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			courseTitle: r.course.title,
			rating: r.rating,
			createdAt: r.createdAt,
		}));
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/courseReview.repository.ts server/repositories/courseReview.repository.integration.test.ts
git commit -m "feat(dashboard): add courseReviewRepository.findRecentByInstructor"
```

---

## Task 7: `instructorService.getTopPerformingCourses`

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`
- Test: `server/services/instructor/instructor.service.test.ts` (append)

Orchestrates: revenue ranking → batched cards + ratings → assemble, deterministically re-sort (revenue↓, students↓, title↑), slice to limit. Drops courses missing from the cards map (soft-deleted / not owned).

- [ ] **Step 1: Append the failing unit test**

In `server/services/instructor/instructor.service.test.ts`, extend the mock objects and add a new describe block. First update the existing mock declarations near the top:

```ts
const mockPaymentRepo = {
	getInstructorRevenueStats: vi.fn(),
	getRevenueGroupedByCourse: vi.fn(),
};
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
	findRecentByInstructor: vi.fn(),
};
const mockReviewRepo = {
	getInstructorRatingStats: vi.fn(),
	getAvgRatingByCourseIds: vi.fn(),
	findRecentByInstructor: vi.fn(),
};
const mockCourseRepo = {
	getCoursesStats: vi.fn(),
	getCourseCardsByIds: vi.fn(),
};
```

Then append:

```ts
describe("InstructorService.getTopPerformingCourses", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("ranks by revenue, attaches students + rating, drops missing courses", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([
			{ courseId: "c1", grossCents: 5000 },
			{ courseId: "c2", grossCents: 3000 },
			{ courseId: "gone", grossCents: 1000 },
		]);
		mockCourseRepo.getCourseCardsByIds.mockResolvedValue(
			new Map([
				["c1", { title: "C One", students: 10 }],
				["c2", { title: "C Two", students: 7 }],
				// "gone" omitted → soft-deleted, must be dropped
			]),
		);
		mockReviewRepo.getAvgRatingByCourseIds.mockResolvedValue(
			new Map([["c1", 4.5]]), // c2 has no reviews → null
		);

		const result = await instructorService.getTopPerformingCourses("i1");

		expect(result).toEqual([
			{
				courseId: "c1",
				title: "C One",
				students: 10,
				rating: 4.5,
				grossCents: 5000,
			},
			{
				courseId: "c2",
				title: "C Two",
				students: 7,
				rating: null,
				grossCents: 3000,
			},
		]);
	});

	it("returns [] when the instructor has no revenue", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([]);
		const result = await instructorService.getTopPerformingCourses("i1");
		expect(result).toEqual([]);
		expect(mockCourseRepo.getCourseCardsByIds).not.toHaveBeenCalled();
	});

	it("breaks revenue ties by students desc, then title asc", async () => {
		mockPaymentRepo.getRevenueGroupedByCourse.mockResolvedValue([
			{ courseId: "a", grossCents: 1000 },
			{ courseId: "b", grossCents: 1000 },
			{ courseId: "c", grossCents: 1000 },
		]);
		mockCourseRepo.getCourseCardsByIds.mockResolvedValue(
			new Map([
				["a", { title: "Zeta", students: 5 }],
				["b", { title: "Alpha", students: 5 }],
				["c", { title: "Beta", students: 9 }],
			]),
		);
		mockReviewRepo.getAvgRatingByCourseIds.mockResolvedValue(new Map());

		const result = await instructorService.getTopPerformingCourses("i1");
		expect(result.map((r) => r.courseId)).toEqual(["c", "b", "a"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: FAIL — `getTopPerformingCourses is not a function`.

- [ ] **Step 3: Implement the method**

In `server/services/instructor/instructor.service.ts`, extend the dashboard-entity import:

```ts
import type {
	ActivityEvent,
	DashboardStats,
	TopCourse,
} from "@/server/entities/instructor/dashboard";
```

Then add inside the `InstructorService` class (after `getDashboardStats`):

```ts
	async getTopPerformingCourses(
		instructorId: string,
		limit = 3,
	): Promise<TopCourse[]> {
		logger.info("Getting instructor top performing courses", { instructorId });

		const ranked = await paymentRepository.getRevenueGroupedByCourse(
			instructorId,
			new Date(0),
			limit,
		);
		if (ranked.length === 0) return [];

		const courseIds = ranked.map((r) => r.courseId);
		const [cards, ratings] = await Promise.all([
			courseRepository.getCourseCardsByIds(instructorId, courseIds),
			courseReviewRepository.getAvgRatingByCourseIds(courseIds),
		]);

		const rows: TopCourse[] = [];
		for (const { courseId, grossCents } of ranked) {
			const card = cards.get(courseId);
			if (!card) continue; // soft-deleted / not owned → drop
			rows.push({
				courseId,
				title: card.title,
				students: card.students,
				rating: ratings.get(courseId) ?? null,
				grossCents,
			});
		}

		rows.sort(
			(a, b) =>
				b.grossCents - a.grossCents ||
				b.students - a.students ||
				a.title.localeCompare(b.title),
		);
		return rows.slice(0, limit);
	}
```

> `ActivityEvent` is imported now but used in Task 8; if Biome flags an unused import between tasks, leave it — Task 8 consumes it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/instructor/instructor.service.ts server/services/instructor/instructor.service.test.ts
git commit -m "feat(dashboard): add instructorService.getTopPerformingCourses"
```

---

## Task 8: `instructorService.getRecentActivity`

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`
- Test: `server/services/instructor/instructor.service.test.ts` (append)

Fetches recent enrollments + reviews concurrently, maps to the `ActivityEvent` union, sorts by `occurredAt` desc, slices to limit.

- [ ] **Step 1: Append the failing unit test**

Append to `server/services/instructor/instructor.service.test.ts`:

```ts
describe("InstructorService.getRecentActivity", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("merges enrollments and reviews newest-first and caps the count", async () => {
		mockEnrollmentRepo.findRecentByInstructor.mockResolvedValue([
			{
				id: "e1",
				studentName: "Ann",
				courseTitle: "Course A",
				enrolledAt: new Date("2026-03-03T00:00:00Z"),
			},
			{
				id: "e2",
				studentName: "Bob",
				courseTitle: "Course B",
				enrolledAt: new Date("2026-03-01T00:00:00Z"),
			},
		]);
		mockReviewRepo.findRecentByInstructor.mockResolvedValue([
			{
				id: "r1",
				studentName: "Cara",
				courseTitle: "Course A",
				rating: 5,
				createdAt: new Date("2026-03-02T00:00:00Z"),
			},
		]);

		const result = await instructorService.getRecentActivity("i1", 2);

		expect(result).toEqual([
			{
				type: "enrollment",
				id: "e1",
				studentName: "Ann",
				courseTitle: "Course A",
				occurredAt: new Date("2026-03-03T00:00:00Z"),
			},
			{
				type: "review",
				id: "r1",
				studentName: "Cara",
				courseTitle: "Course A",
				rating: 5,
				occurredAt: new Date("2026-03-02T00:00:00Z"),
			},
		]);
	});

	it("returns [] when there is no activity", async () => {
		mockEnrollmentRepo.findRecentByInstructor.mockResolvedValue([]);
		mockReviewRepo.findRecentByInstructor.mockResolvedValue([]);
		const result = await instructorService.getRecentActivity("i1");
		expect(result).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: FAIL — `getRecentActivity is not a function`.

- [ ] **Step 3: Implement the method**

Add inside the `InstructorService` class (after `getTopPerformingCourses`):

```ts
	async getRecentActivity(
		instructorId: string,
		limit = 5,
	): Promise<ActivityEvent[]> {
		logger.info("Getting instructor recent activity", { instructorId });

		const [enrollments, reviews] = await Promise.all([
			enrollmentRepository.findRecentByInstructor(instructorId, limit),
			courseReviewRepository.findRecentByInstructor(instructorId, limit),
		]);

		const events: ActivityEvent[] = [
			...enrollments.map(
				(e): ActivityEvent => ({
					type: "enrollment",
					id: e.id,
					studentName: e.studentName,
					courseTitle: e.courseTitle,
					occurredAt: e.enrolledAt,
				}),
			),
			...reviews.map(
				(r): ActivityEvent => ({
					type: "review",
					id: r.id,
					studentName: r.studentName,
					courseTitle: r.courseTitle,
					rating: r.rating,
					occurredAt: r.createdAt,
				}),
			),
		];

		events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
		return events.slice(0, limit);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/instructor/instructor.service.ts server/services/instructor/instructor.service.test.ts
git commit -m "feat(dashboard): add instructorService.getRecentActivity"
```

---

## Task 9: Router — expose the two queries

**Files:**
- Modify: `server/api/routers/instructor.ts`

No dedicated test (the router has none; verified by `pnpm typecheck` and downstream usage).

- [ ] **Step 1: Add the two queries**

In `server/api/routers/instructor.ts`, add after the existing `getDashboardStats` query (inside `createTRPCRouter({ ... })`):

```ts
	getTopPerformingCourses: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getTopPerformingCourses(
				ctx.session.user.id,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getRecentActivity: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getRecentActivity(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/routers/instructor.ts
git commit -m "feat(dashboard): expose getTopPerformingCourses and getRecentActivity"
```

---

## Task 10: RSC fetch helpers

**Files:**
- Create: `lib/requests/instructor/getTopPerformingCourses.ts`
- Create: `lib/requests/instructor/getRecentActivity.ts`

Mirror `lib/requests/instructor/getDashboardStats.ts`: try the caller, log + return `[]` on failure (per-widget degradation).

- [ ] **Step 1: Create `getTopPerformingCourses.ts`**

```ts
import type { TopCourse } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Top performing courses for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getTopPerformingCourses = async (): Promise<TopCourse[]> => {
	try {
		return await api.instructor.getTopPerformingCourses();
	} catch (error) {
		console.error("Error fetching instructor top performing courses:", error);
		return [];
	}
};

export default getTopPerformingCourses;
```

- [ ] **Step 2: Create `getRecentActivity.ts`**

```ts
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Recent activity feed for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getRecentActivity = async (): Promise<ActivityEvent[]> => {
	try {
		return await api.instructor.getRecentActivity();
	} catch (error) {
		console.error("Error fetching instructor recent activity:", error);
		return [];
	}
};

export default getRecentActivity;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/requests/instructor/getTopPerformingCourses.ts lib/requests/instructor/getRecentActivity.ts
git commit -m "feat(dashboard): add RSC fetch helpers for top courses and activity"
```

---

## Task 11: `TopPerformingCourses` component

**Files:**
- Create: `app/_components/Instructor/TopPerformingCourses/types.ts`
- Create: `app/_components/Instructor/TopPerformingCourses/index.tsx`

Renders the card: header + "View All" link, then ≤3 rows or an empty state. Currency via `formatUsd(grossCents)`; rating shows `—` when `null`.

- [ ] **Step 1: Create `types.ts`**

```ts
import type { TopCourse } from "@/server/entities/instructor/dashboard";

export type TopPerformingCoursesProps = {
	courses: TopCourse[];
};

export type TopCourseRowProps = {
	course: TopCourse;
};
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
import { Star, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import type {
	TopCourseRowProps,
	TopPerformingCoursesProps,
} from "./types";

function TopCourseRow({ course }: TopCourseRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border p-4">
			<div className="flex-1">
				<h3 className="font-medium">{course.title}</h3>
				<div className="mt-1 flex items-center gap-4 text-muted-foreground text-sm">
					<span className="flex items-center gap-1">
						<Users className="h-4 w-4" />
						{course.students} students
					</span>
					<span className="flex items-center gap-1">
						<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
						{course.rating === null ? "—" : course.rating.toFixed(1)}
					</span>
				</div>
			</div>
			<div className="text-right">
				<p className="font-semibold text-green-600">
					{formatUsd(course.grossCents)}
				</p>
			</div>
		</div>
	);
}

export default function TopPerformingCourses({
	courses,
}: TopPerformingCoursesProps) {
	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-lg">Top Performing Courses</h2>
				<Button asChild size="sm" variant="ghost">
					<Link href={INSTRUCTOR_URLS.courses}>View All</Link>
				</Button>
			</div>

			{courses.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					No course sales yet. Your top earners will appear here.
				</p>
			)}

			{courses.length > 0 && (
				<div className="space-y-4">
					{courses.map((course) => (
						<TopCourseRow course={course} key={course.courseId} />
					))}
				</div>
			)}
		</Card>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/TopPerformingCourses
git commit -m "feat(dashboard): add TopPerformingCourses component"
```

---

## Task 12: `RecentActivity` component

**Files:**
- Create: `app/_components/Instructor/RecentActivity/types.ts`
- Create: `app/_components/Instructor/RecentActivity/index.tsx`

Renders ≤5 rows or an empty state. Icon chosen by `event.type` via a small early-return helper (no nested ternary). Relative time via `relativeTimeLabel`. Wording generated from real records.

- [ ] **Step 1: Create `types.ts`**

```ts
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";

export type RecentActivityProps = {
	events: ActivityEvent[];
};

export type ActivityRowProps = {
	event: ActivityEvent;
};
```

- [ ] **Step 2: Create `index.tsx`**

```tsx
import { Star, Users } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import relativeTimeLabel from "@/lib/utils/date/relativeTime";
import type { ActivityRowProps, RecentActivityProps } from "./types";

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
	if (type === "review") return <Star className="h-4 w-4 text-primary" />;
	return <Users className="h-4 w-4 text-primary" />;
}

function activityText(event: ActivityEvent): string {
	if (event.type === "review") {
		return `${event.studentName} left a ${event.rating}-star review on ${event.courseTitle}`;
	}
	return `${event.studentName} enrolled in ${event.courseTitle}`;
}

function ActivityRow({ event }: ActivityRowProps) {
	return (
		<div className="flex items-start gap-3 rounded-lg border p-4">
			<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<ActivityIcon type={event.type} />
			</div>
			<div className="flex-1">
				<p className="font-medium text-sm">{activityText(event)}</p>
				<p className="text-muted-foreground text-xs">
					{relativeTimeLabel(event.occurredAt)}
				</p>
			</div>
		</div>
	);
}

export default function RecentActivity({ events }: RecentActivityProps) {
	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-lg">Recent Activity</h2>
			</div>

			{events.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					No recent activity yet. Enrollments and reviews will show up here.
				</p>
			)}

			{events.length > 0 && (
				<div className="space-y-4">
					{events.map((event) => (
						<ActivityRow event={event} key={event.id} />
					))}
				</div>
			)}
		</Card>
	);
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Instructor/RecentActivity
git commit -m "feat(dashboard): add RecentActivity component"
```

---

## Task 13: Wire the page

**Files:**
- Modify: `app/instructor/page.tsx`

Replace the two hardcoded `<Card>` blocks with the new components and fetch everything in one `Promise.all`.

- [ ] **Step 1: Replace the file body**

Overwrite `app/instructor/page.tsx` with:

```tsx
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import DashboardRevenueChart from "@/app/_components/Instructor/DashboardRevenueChart";
import DashboardStatsCards from "@/app/_components/Instructor/DashboardStatsCards";
import RecentActivity from "@/app/_components/Instructor/RecentActivity";
import TopPerformingCourses from "@/app/_components/Instructor/TopPerformingCourses";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getDashboardStats from "@/lib/requests/instructor/getDashboardStats";
import getRecentActivity from "@/lib/requests/instructor/getRecentActivity";
import getRevenueTimeSeries from "@/lib/requests/instructor/getRevenueTimeSeries";
import getTopPerformingCourses from "@/lib/requests/instructor/getTopPerformingCourses";

export default async function DashboardPage() {
	const [stats, revenueSeries, topCourses, activity] = await Promise.all([
		getDashboardStats(),
		getRevenueTimeSeries(),
		getTopPerformingCourses(),
		getRecentActivity(),
	]);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Instructor Dashboard</h1>
					<p className="text-muted-foreground">
						Welcome back! Here's your teaching overview.
					</p>
				</div>
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.createCourse}>Create New Course</Link>
				</Button>
			</div>

			{/* Stats Cards */}
			<DashboardStatsCards stats={stats} />

			{/* Course Performance */}
			<div className="grid gap-6 lg:grid-cols-2">
				<TopPerformingCourses courses={topCourses} />
				<RecentActivity events={activity} />
			</div>

			{/* Revenue Overview */}
			<Card className="p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-lg">Revenue Overview</h2>
					<Button asChild size="sm" variant="outline">
						<Link href="/instructor/revenue">View Details</Link>
					</Button>
				</div>
				<DashboardRevenueChart data={revenueSeries} />
			</Card>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS (no type errors; Biome clean — imports auto-sorted).

- [ ] **Step 3: Commit**

```bash
git add app/instructor/page.tsx
git commit -m "feat(dashboard): wire real top courses and recent activity into the page"
```

---

## Task 14: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Lint/format**

Run: `pnpm check`
Expected: PASS (no diagnostics).

- [ ] **Step 3: Unit tests**

Run: `pnpm test:unit`
Expected: PASS — includes `relativeTime`, both new `instructorService` describe blocks.

- [ ] **Step 4: Integration tests**

Run: `pnpm test:integration`
Expected: PASS — includes `course`, `courseReview`, `enrollment` repository describe blocks. (Requires the `learnix_test` DB — see `.env.test.example`.)

- [ ] **Step 5: Production build**

Run: `pnpm build`
Expected: SUCCESS.

- [ ] **Step 6: Manual smoke (see `validation.md`)**

Sign in as an instructor with sales/enrollments/reviews → dashboard shows real top 3 by revenue and a merged activity feed. Sign in as a brand-new instructor → both cards show empty-state copy, no fabricated rows.

---

## Self-Review notes

- **Spec coverage:** FR1–FR6 → Tasks 3,4,7,11; FR7–FR12 → Tasks 2,5,6,8,12; authz/perf/reliability NFRs → Tasks 5/6/9 (ownership filters), 10 (per-widget `[]` fallback), 7/8 (batched queries). Page swap → Task 13.
- **No new payment repo method** — reuses `getRevenueGroupedByCourse` with `since = new Date(0)` (documented in Task 7).
- **Type consistency:** `TopCourse` / `ActivityEvent` field names are identical across DTO (Task 1), service (Tasks 7–8), helpers (Task 10), and components (Tasks 11–12). Repo flat-row shapes (`{ id, studentName, courseTitle, enrolledAt|createdAt, rating? }`) match the service's mapping inputs.