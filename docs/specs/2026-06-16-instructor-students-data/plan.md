# Instructor Students Page — Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded mock data on the instructor Students page with real, instructor-scoped student data (stats, paginated/filtered/sorted list, and details dialog).

**Architecture:** Two new `instructorProcedure` tRPC queries (`getStudents`, `getStudentStatusCounts`) backed by raw-SQL aggregate methods on `enrollmentRepository`; the service shapes/rounds DTOs; the page is refactored into a `Instructor/Students` client component tree using `api.*.useQuery`. The course-filter dropdown reuses the existing `course.getOwnCourses`.

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma (`$queryRaw` over PostgreSQL), Zod, React Query (`trpc/client`), date-fns, Vitest, Biome.

---

## Conventions for every task

- Run unit tests with `pnpm test:unit <path>` and integration tests with `pnpm test:integration <path>` (integration needs the `learnix_test` DB — `docker-compose up -d` first).
- After code changes run `pnpm typecheck` and `pnpm check:write` before committing.
- Commit messages follow the repo's conventional style.

---

## Task 1: Entity DTOs and input schema

**Files:**
- Create: `server/entities/instructor/students.ts`
- Test: `server/entities/instructor/students.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/entities/instructor/students.test.ts
import { describe, expect, it } from "vitest";
import { getStudentsInput } from "./students";

describe("getStudentsInput", () => {
	it("applies defaults for sort and page", () => {
		const parsed = getStudentsInput.parse({});
		expect(parsed).toMatchObject({ status: "all", sort: "recent", page: 1 });
	});

	it("rejects an unknown sort value", () => {
		expect(() => getStudentsInput.parse({ sort: "bogus" })).toThrow();
	});

	it("trims the search query and rejects page < 1", () => {
		expect(getStudentsInput.parse({ q: "  ann  " }).q).toBe("ann");
		expect(() => getStudentsInput.parse({ page: 0 })).toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/entities/instructor/students.test.ts`
Expected: FAIL — cannot find module `./students`.

- [ ] **Step 3: Write the entity file**

```ts
// server/entities/instructor/students.ts
import { z } from "zod";

export type StudentStatus = "active" | "completed" | "inactive";

export type StudentCourseProgress = {
	courseId: string;
	title: string;
	progress: number; // 0..100, this enrollment
	completed: boolean; // enrollment.status === "completed"
};

export type StudentRow = {
	id: string; // user id
	name: string;
	email: string;
	image: string | null;
	courses: StudentCourseProgress[]; // this instructor's courses only
	overallProgress: number; // rounded average across courses
	lastActiveAt: Date | null; // max lastAccessedAt; null → "Never"
	joinedAt: Date; // min enrolledAt
	status: StudentStatus; // derived
};

export type PaginatedStudents = {
	data: StudentRow[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};

export type StudentStatusCounts = {
	total: number;
	active: number;
	completed: number;
	inactive: number;
};

export const getStudentsInput = z.object({
	q: z.string().trim().max(200).optional(),
	status: z.enum(["all", "active", "completed", "inactive"]).default("all"),
	courseId: z.string().cuid().optional(),
	sort: z.enum(["recent", "name", "progress"]).default("recent"),
	page: z.number().int().min(1).default(1),
});

export type GetStudentsInput = z.infer<typeof getStudentsInput>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/entities/instructor/students.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/entities/instructor/students.ts server/entities/instructor/students.test.ts
git commit -m "feat(instructor): add student DTOs and getStudents input schema"
```

---

## Task 2: Repository — `findInstructorStudents`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to `server/repositories/enrollment.repository.integration.test.ts`:

```ts
import { CourseStatus, EnrollmentStatus, Role } from "@/generated/prisma";
// (CourseStatus, Role already imported at top — add EnrollmentStatus to that import)

describe("EnrollmentRepository.findInstructorStudents", () => {
	const cutoff = new Date("2026-06-09T00:00:00Z"); // "now" - 7 days for these fixtures

	it("aggregates one row per student with this instructor's courses only", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const c1 = await makeCourse({
			instructorId: instructor.id,
			title: "Course One",
			status: CourseStatus.published,
		});
		const foreign = await makeCourse({
			instructorId: other.id,
			title: "Foreign",
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT, name: "Aaa Student" });
		await makeEnrollment({
			studentId: student.id,
			courseId: c1.id,
			progress: 40,
			enrolledAt: new Date("2026-06-10T00:00:00Z"),
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: student.id,
			courseId: foreign.id,
			progress: 100,
		});

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "all",
			sort: "recent",
			page: 1,
			perPage: 10,
		});

		expect(total).toBe(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: student.id,
			name: "Aaa Student",
			progress: 40,
			status: "active",
		});
		expect(rows[0]?.courses).toHaveLength(1); // foreign course excluded
		expect(rows[0]?.courses[0]).toMatchObject({ title: "Course One", progress: 40 });
	});

	it("derives completed and inactive statuses", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const done = await makeUser({ role: Role.STUDENT, name: "Done" });
		const stale = await makeUser({ role: Role.STUDENT, name: "Stale" });
		await makeEnrollment({
			studentId: done.id,
			courseId: course.id,
			status: EnrollmentStatus.completed,
			progress: 100,
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: stale.id,
			courseId: course.id,
			progress: 20,
			lastAccessedAt: new Date("2026-05-01T00:00:00Z"), // older than cutoff
		});

		const { rows } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "all",
			sort: "name",
			page: 1,
			perPage: 10,
		});

		const byName = Object.fromEntries(rows.map((r) => [r.name, r.status]));
		expect(byName.Done).toBe("completed");
		expect(byName.Stale).toBe("inactive");
	});

	it("filters by status and excludes cancelled-only students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const cancelled = await makeUser({ role: Role.STUDENT, name: "Gone" });
		await makeEnrollment({
			studentId: cancelled.id,
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
		});

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId: instructor.id,
			cutoff,
			status: "active",
			sort: "recent",
			page: 1,
			perPage: 10,
		});

		expect(total).toBe(0);
		expect(rows).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts`
Expected: FAIL — `findInstructorStudents is not a function`.

- [ ] **Step 3: Implement the method**

In `server/repositories/enrollment.repository.ts`, update the top import to add `Prisma` as a value and `StudentStatus`/course-progress types:

```ts
import { EnrollmentStatus, Prisma, type Enrollment } from "@/generated/prisma";
import { getMonthWindows } from "@/lib/stats/monthWindows";
import type {
	StudentCourseProgress,
	StudentStatus,
} from "@/server/entities/instructor/students";
import { BaseRepository } from "./base/base.repository";
```

Add these types above the class:

```ts
export type FindInstructorStudentsParams = {
	instructorId: string;
	cutoff: Date;
	q?: string;
	status: "all" | StudentStatus;
	courseId?: string;
	sort: "recent" | "name" | "progress";
	page: number;
	perPage: number;
};

export type RawStudentRow = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	progress: number;
	last_active_at: Date | null;
	joined_at: Date;
	status: StudentStatus;
	courses: StudentCourseProgress[];
};
```

Add this method inside the class (e.g. after `findRecentByInstructor`):

```ts
	async findInstructorStudents(
		params: FindInstructorStudentsParams,
	): Promise<{ rows: RawStudentRow[]; total: number }> {
		const { instructorId, cutoff, q, status, courseId, sort, page, perPage } =
			params;

		const courseClause = courseId
			? Prisma.sql`AND e."studentId" IN (SELECT "studentId" FROM enrollments WHERE "courseId" = ${courseId})`
			: Prisma.empty;
		const searchClause = q
			? Prisma.sql`AND (name ILIKE ${`%${q}%`} OR email ILIKE ${`%${q}%`})`
			: Prisma.empty;
		const statusClause =
			status === "all" ? Prisma.empty : Prisma.sql`AND status = ${status}`;
		const orderBy =
			sort === "name"
				? Prisma.sql`ORDER BY name ASC`
				: sort === "progress"
					? Prisma.sql`ORDER BY progress DESC`
					: Prisma.sql`ORDER BY recent_enrolled_at DESC`;

		const cte = Prisma.sql`
			WITH student_rows AS (
				SELECT
					e."studentId" AS id,
					ROUND(AVG(e.progress))::int AS progress,
					MAX(e."lastAccessedAt") AS last_active_at,
					MIN(e."enrolledAt") AS joined_at,
					MAX(e."enrolledAt") AS recent_enrolled_at,
					bool_and(e.status = 'completed') AS all_completed,
					json_agg(
						json_build_object(
							'courseId', c.id,
							'title', c.title,
							'progress', e.progress,
							'completed', e.status = 'completed'
						) ORDER BY e."enrolledAt" DESC
					) AS courses
				FROM enrollments e
				JOIN courses c ON c.id = e."courseId"
				WHERE c."instructorId" = ${instructorId}
					AND c.deleted_at IS NULL
					AND e.status <> 'cancelled'
					${courseClause}
				GROUP BY e."studentId"
			), enriched AS (
				SELECT
					s.id, s.progress, s.last_active_at, s.joined_at,
					s.recent_enrolled_at, s.courses,
					u.name, u.email, u.image,
					CASE
						WHEN s.all_completed THEN 'completed'
						WHEN s.last_active_at IS NULL OR s.last_active_at < ${cutoff} THEN 'inactive'
						ELSE 'active'
					END AS status
				FROM student_rows s
				JOIN users u ON u.id = s.id
			)
		`;

		const [rows, totalRows] = await Promise.all([
			this.db.$queryRaw<RawStudentRow[]>`
				${cte}
				SELECT id, name, email, image, progress, last_active_at, joined_at, status, courses
				FROM enriched
				WHERE TRUE ${searchClause} ${statusClause}
				${orderBy}
				LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
			`,
			this.db.$queryRaw<[{ count: bigint }]>`
				${cte}
				SELECT COUNT(*)::bigint AS count
				FROM enriched
				WHERE TRUE ${searchClause} ${statusClause}
			`,
		]);

		return { rows, total: Number(totalRows[0]?.count ?? 0) };
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(instructor): add findInstructorStudents aggregate query"
```

---

## Task 3: Repository — `getInstructorStudentStatusCounts`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Append to the integration test file:

```ts
describe("EnrollmentRepository.getInstructorStudentStatusCounts", () => {
	const cutoff = new Date("2026-06-09T00:00:00Z");

	it("counts students by derived status, summing to total", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const active = await makeUser({ role: Role.STUDENT });
		const done = await makeUser({ role: Role.STUDENT });
		const stale = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({
			studentId: active.id,
			courseId: course.id,
			progress: 30,
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: done.id,
			courseId: course.id,
			status: EnrollmentStatus.completed,
			progress: 100,
			lastAccessedAt: new Date("2026-06-15T00:00:00Z"),
		});
		await makeEnrollment({
			studentId: stale.id,
			courseId: course.id,
			progress: 10,
			lastAccessedAt: new Date("2026-05-01T00:00:00Z"),
		});

		const counts = await enrollmentRepository.getInstructorStudentStatusCounts(
			instructor.id,
			cutoff,
		);

		expect(counts).toEqual({
			total: 3,
			active: 1,
			completed: 1,
			inactive: 1,
		});
	});

	it("returns all zeros for an instructor with no students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const counts = await enrollmentRepository.getInstructorStudentStatusCounts(
			instructor.id,
			cutoff,
		);
		expect(counts).toEqual({ total: 0, active: 0, completed: 0, inactive: 0 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts -t "getInstructorStudentStatusCounts"`
Expected: FAIL — `getInstructorStudentStatusCounts is not a function`.

- [ ] **Step 3: Implement the method**

Add to `server/repositories/enrollment.repository.ts` inside the class:

```ts
	async getInstructorStudentStatusCounts(
		instructorId: string,
		cutoff: Date,
	): Promise<{
		total: number;
		active: number;
		completed: number;
		inactive: number;
	}> {
		const rows = await this.db.$queryRaw<
			[{ total: bigint; active: bigint; completed: bigint; inactive: bigint }]
		>`
			WITH student_rows AS (
				SELECT
					e."studentId" AS id,
					MAX(e."lastAccessedAt") AS last_active_at,
					bool_and(e.status = 'completed') AS all_completed
				FROM enrollments e
				JOIN courses c ON c.id = e."courseId"
				WHERE c."instructorId" = ${instructorId}
					AND c.deleted_at IS NULL
					AND e.status <> 'cancelled'
				GROUP BY e."studentId"
			), enriched AS (
				SELECT
					CASE
						WHEN all_completed THEN 'completed'
						WHEN last_active_at IS NULL OR last_active_at < ${cutoff} THEN 'inactive'
						ELSE 'active'
					END AS status
				FROM student_rows
			)
			SELECT
				COUNT(*)::bigint AS total,
				COUNT(*) FILTER (WHERE status = 'active')::bigint AS active,
				COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed,
				COUNT(*) FILTER (WHERE status = 'inactive')::bigint AS inactive
			FROM enriched
		`;
		const r = rows[0];
		return {
			total: Number(r?.total ?? 0),
			active: Number(r?.active ?? 0),
			completed: Number(r?.completed ?? 0),
			inactive: Number(r?.inactive ?? 0),
		};
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/enrollment.repository.integration.test.ts -t "getInstructorStudentStatusCounts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(instructor): add getInstructorStudentStatusCounts query"
```

---

## Task 4: Service — `getStudents` and `getStudentStatusCounts`

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`
- Test: `server/services/instructor/instructor.service.test.ts`

- [ ] **Step 1: Write the failing unit test**

In `server/services/instructor/instructor.service.test.ts`, add `findInstructorStudents` and `getInstructorStudentStatusCounts` to the existing `mockEnrollmentRepo` object:

```ts
const mockEnrollmentRepo = {
	getInstructorStudentStats: vi.fn(),
	findRecentByInstructor: vi.fn(),
	findInstructorStudents: vi.fn(),
	getInstructorStudentStatusCounts: vi.fn(),
};
```

Then add a new describe block:

```ts
describe("InstructorService.getStudents", () => {
	beforeEach(() => vi.clearAllMocks());

	it("maps repo rows to StudentRow DTOs and computes pagination", async () => {
		mockEnrollmentRepo.findInstructorStudents.mockResolvedValue({
			rows: [
				{
					id: "u1",
					name: "Ann",
					email: "ann@example.com",
					image: null,
					progress: 50,
					last_active_at: new Date("2026-06-15T00:00:00Z"),
					joined_at: new Date("2026-06-01T00:00:00Z"),
					status: "active",
					courses: [
						{ courseId: "c1", title: "C1", progress: 50, completed: false },
					],
				},
			],
			total: 23,
		});

		const result = await instructorService.getStudents(INSTRUCTOR_ID, {
			status: "all",
			sort: "recent",
			page: 2,
		});

		expect(result.total).toBe(23);
		expect(result.currentPage).toBe(2);
		expect(result.perPage).toBe(10);
		expect(result.lastPage).toBe(3); // ceil(23/10)
		expect(result.data[0]).toMatchObject({
			id: "u1",
			overallProgress: 50,
			lastActiveAt: new Date("2026-06-15T00:00:00Z"),
			joinedAt: new Date("2026-06-01T00:00:00Z"),
			status: "active",
		});
		// cutoff passed to repo is ~7 days before now
		const callArg = mockEnrollmentRepo.findInstructorStudents.mock.calls[0][0];
		const daysAgo =
			(Date.now() - callArg.cutoff.getTime()) / (1000 * 60 * 60 * 24);
		expect(Math.round(daysAgo)).toBe(7);
	});

	it("returns lastPage of 1 when there are no students", async () => {
		mockEnrollmentRepo.findInstructorStudents.mockResolvedValue({
			rows: [],
			total: 0,
		});
		const result = await instructorService.getStudents(INSTRUCTOR_ID, {
			status: "all",
			sort: "recent",
			page: 1,
		});
		expect(result).toMatchObject({ total: 0, lastPage: 1, data: [] });
	});
});

describe("InstructorService.getStudentStatusCounts", () => {
	it("returns the counts from the repository", async () => {
		mockEnrollmentRepo.getInstructorStudentStatusCounts.mockResolvedValue({
			total: 5,
			active: 3,
			completed: 1,
			inactive: 1,
		});
		const counts =
			await instructorService.getStudentStatusCounts(INSTRUCTOR_ID);
		expect(counts).toEqual({ total: 5, active: 3, completed: 1, inactive: 1 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: FAIL — `instructorService.getStudents is not a function`.

- [ ] **Step 3: Implement the service methods**

In `server/services/instructor/instructor.service.ts`, add imports near the top:

```ts
import { subDays } from "date-fns";
import type {
	GetStudentsInput,
	PaginatedStudents,
	StudentStatusCounts,
} from "@/server/entities/instructor/students";
```

Add constants above the `InstructorService` class:

```ts
const INACTIVE_DAYS = 7;
const STUDENTS_PER_PAGE = 10;
```

Add these methods inside the class:

```ts
	async getStudents(
		instructorId: string,
		input: GetStudentsInput,
	): Promise<PaginatedStudents> {
		logger.info("Getting instructor students", { instructorId, ...input });

		const perPage = STUDENTS_PER_PAGE;
		const cutoff = subDays(new Date(), INACTIVE_DAYS);

		const { rows, total } = await enrollmentRepository.findInstructorStudents({
			instructorId,
			cutoff,
			q: input.q,
			status: input.status,
			courseId: input.courseId,
			sort: input.sort,
			page: input.page,
			perPage,
		});

		return {
			data: rows.map((r) => ({
				id: r.id,
				name: r.name,
				email: r.email,
				image: r.image,
				courses: r.courses,
				overallProgress: r.progress,
				lastActiveAt: r.last_active_at,
				joinedAt: r.joined_at,
				status: r.status,
			})),
			total,
			currentPage: input.page,
			perPage,
			lastPage: Math.max(1, Math.ceil(total / perPage)),
		};
	}

	async getStudentStatusCounts(
		instructorId: string,
	): Promise<StudentStatusCounts> {
		logger.info("Getting instructor student status counts", { instructorId });
		const cutoff = subDays(new Date(), INACTIVE_DAYS);
		return enrollmentRepository.getInstructorStudentStatusCounts(
			instructorId,
			cutoff,
		);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/services/instructor/instructor.service.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add server/services/instructor/instructor.service.ts server/services/instructor/instructor.service.test.ts
git commit -m "feat(instructor): add getStudents and getStudentStatusCounts service methods"
```

---

## Task 5: Router — wire the two queries

**Files:**
- Modify: `server/api/routers/instructor.ts`

- [ ] **Step 1: Add the procedures**

In `server/api/routers/instructor.ts`, add the entity import at the top:

```ts
import { getStudentsInput } from "@/server/entities/instructor/students";
```

Add these two procedures to the `instructorRouter` object (after `getRecentActivity`):

```ts
	getStudents: instructorProcedure
		.input(getStudentsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getStudents(
					ctx.session.user.id,
					input,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getStudentStatusCounts: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getStudentStatusCounts(
				ctx.session.user.id,
			);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS — no type errors; `api.instructor.getStudents` / `getStudentStatusCounts` now exist on `AppRouter`.

- [ ] **Step 3: Commit**

```bash
pnpm check:write
git add server/api/routers/instructor.ts
git commit -m "feat(instructor): expose getStudents and getStudentStatusCounts tRPC queries"
```

---

## Task 6: Frontend utilities + debounce hook

**Files:**
- Create: `app/_components/Instructor/Students/utils.ts`
- Create: `app/_components/Instructor/Students/hooks/useDebouncedValue.ts`
- Test: `app/_components/Instructor/Students/utils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/_components/Instructor/Students/utils.test.ts
import { describe, expect, it } from "vitest";
import { formatLastActive, getInitials, statusBadgeClass } from "./utils";

describe("Students utils", () => {
	it("builds uppercase initials from a name", () => {
		expect(getInitials("Sarah Johnson")).toBe("SJ");
		expect(getInitials("madonna")).toBe("M");
	});

	it("returns 'Never' for a null last-active date", () => {
		expect(formatLastActive(null)).toBe("Never");
	});

	it("returns a relative string for a real date", () => {
		const result = formatLastActive(new Date(Date.now() - 1000 * 60 * 60));
		expect(result).toMatch(/ago/);
	});

	it("maps each status to a non-empty class string", () => {
		expect(statusBadgeClass("active")).toContain("green");
		expect(statusBadgeClass("completed")).toContain("blue");
		expect(statusBadgeClass("inactive")).toContain("gray");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit app/_components/Instructor/Students/utils.test.ts`
Expected: FAIL — cannot find module `./utils`.

- [ ] **Step 3: Implement utils and the hook**

```ts
// app/_components/Instructor/Students/utils.ts
import { formatDistanceToNow } from "date-fns";
import type { StudentStatus } from "@/server/entities/instructor/students";

export function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}

export function formatLastActive(date: Date | null): string {
	if (!date) return "Never";
	return formatDistanceToNow(date, { addSuffix: true });
}

export function statusBadgeClass(status: StudentStatus): string {
	switch (status) {
		case "active":
			return "bg-green-500/10 text-green-600 border-green-500/20";
		case "completed":
			return "bg-blue-500/10 text-blue-600 border-blue-500/20";
		default:
			return "bg-gray-500/10 text-gray-600 border-gray-500/20";
	}
}
```

```ts
// app/_components/Instructor/Students/hooks/useDebouncedValue.ts
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(id);
	}, [value, delayMs]);

	return debounced;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit app/_components/Instructor/Students/utils.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add app/_components/Instructor/Students/utils.ts app/_components/Instructor/Students/hooks/useDebouncedValue.ts app/_components/Instructor/Students/utils.test.ts
git commit -m "feat(instructor): add students page utils and debounce hook"
```

---

## Task 7: Frontend — stats cards component

**Files:**
- Create: `app/_components/Instructor/Students/StudentsStatsCards/types.ts`
- Create: `app/_components/Instructor/Students/StudentsStatsCards/index.tsx`

- [ ] **Step 1: Create the types**

```ts
// app/_components/Instructor/Students/StudentsStatsCards/types.ts
import type { LucideIcon } from "lucide-react";
import type { StudentStatusCounts } from "@/server/entities/instructor/students";

export type StudentsStatsCardsProps = {
	counts: StudentStatusCounts | undefined;
	isLoading: boolean;
};

export type StatCardProps = {
	label: string;
	value: number;
	icon: LucideIcon;
	iconWrapClass: string;
	iconClass: string;
};
```

- [ ] **Step 2: Create the component**

```tsx
// app/_components/Instructor/Students/StudentsStatsCards/index.tsx
import { Clock, GraduationCap, TrendingUp, Users } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type { StatCardProps, StudentsStatsCardsProps } from "./types";

function StatCard({
	label,
	value,
	icon: Icon,
	iconWrapClass,
	iconClass,
}: StatCardProps) {
	return (
		<Card className="p-4">
			<div className="flex items-center gap-3">
				<div
					className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconWrapClass}`}
				>
					<Icon className={`h-5 w-5 ${iconClass}`} />
				</div>
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-2xl">{value}</p>
				</div>
			</div>
		</Card>
	);
}

export function StudentsStatsCards({
	counts,
	isLoading,
}: StudentsStatsCardsProps) {
	const c = counts ?? { total: 0, active: 0, completed: 0, inactive: 0 };

	return (
		<div className="grid gap-4 md:grid-cols-4">
			{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
			{!isLoading && (
				<>
					<StatCard
						icon={Users}
						iconClass="text-primary"
						iconWrapClass="bg-primary/10"
						label="Total Students"
						value={c.total}
					/>
					<StatCard
						icon={TrendingUp}
						iconClass="text-green-600"
						iconWrapClass="bg-green-500/10"
						label="Active Learners"
						value={c.active}
					/>
					<StatCard
						icon={GraduationCap}
						iconClass="text-blue-600"
						iconWrapClass="bg-blue-500/10"
						label="Completed"
						value={c.completed}
					/>
					<StatCard
						icon={Clock}
						iconClass="text-gray-600"
						iconWrapClass="bg-gray-500/10"
						label="Inactive"
						value={c.inactive}
					/>
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add app/_components/Instructor/Students/StudentsStatsCards
git commit -m "feat(instructor): add StudentsStatsCards component"
```

---

## Task 8: Frontend — filters component

**Files:**
- Create: `app/_components/Instructor/Students/StudentsFilters/types.ts`
- Create: `app/_components/Instructor/Students/StudentsFilters/index.tsx`

- [ ] **Step 1: Create the types**

```ts
// app/_components/Instructor/Students/StudentsFilters/types.ts
import type { GetStudentsInput } from "@/server/entities/instructor/students";

export type CourseOption = { id: string; title: string };

export type StudentsFiltersProps = {
	search: string;
	onSearchChange: (value: string) => void;
	status: GetStudentsInput["status"];
	onStatusChange: (value: GetStudentsInput["status"]) => void;
	courseId: string; // "all" or a course id
	onCourseChange: (value: string) => void;
	sort: GetStudentsInput["sort"];
	onSortChange: (value: GetStudentsInput["sort"]) => void;
	courses: CourseOption[];
};
```

- [ ] **Step 2: Create the component**

```tsx
// app/_components/Instructor/Students/StudentsFilters/index.tsx
import { ArrowUpDown, BookOpen, Filter, Search } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import type { GetStudentsInput } from "@/server/entities/instructor/students";
import type { StudentsFiltersProps } from "./types";

export function StudentsFilters({
	search,
	onSearchChange,
	status,
	onStatusChange,
	courseId,
	onCourseChange,
	sort,
	onSortChange,
	courses,
}: StudentsFiltersProps) {
	return (
		<Card className="p-4">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div className="relative flex-1 md:max-w-sm">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Search students..."
						value={search}
					/>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Select
						onValueChange={(v) =>
							onStatusChange(v as GetStudentsInput["status"])
						}
						value={status}
					>
						<SelectTrigger className="w-[140px]">
							<Filter className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="active">Active</SelectItem>
							<SelectItem value="completed">Completed</SelectItem>
							<SelectItem value="inactive">Inactive</SelectItem>
						</SelectContent>
					</Select>
					<Select onValueChange={onCourseChange} value={courseId}>
						<SelectTrigger className="w-[220px]">
							<BookOpen className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Course" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Courses</SelectItem>
							{courses.map((course) => (
								<SelectItem key={course.id} value={course.id}>
									{course.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						onValueChange={(v) => onSortChange(v as GetStudentsInput["sort"])}
						value={sort}
					>
						<SelectTrigger className="w-[160px]">
							<ArrowUpDown className="mr-2 h-4 w-4" />
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="recent">Most Recent</SelectItem>
							<SelectItem value="name">Name</SelectItem>
							<SelectItem value="progress">Progress</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>
		</Card>
	);
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add app/_components/Instructor/Students/StudentsFilters
git commit -m "feat(instructor): add StudentsFilters component"
```

---

## Task 9: Frontend — details dialog component

**Files:**
- Create: `app/_components/Instructor/Students/StudentDetailsDialog/types.ts`
- Create: `app/_components/Instructor/Students/StudentDetailsDialog/index.tsx`

- [ ] **Step 1: Create the types**

```ts
// app/_components/Instructor/Students/StudentDetailsDialog/types.ts
import type { StudentRow } from "@/server/entities/instructor/students";

export type StudentDetailsDialogProps = {
	student: StudentRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};
```

- [ ] **Step 2: Create the component**

```tsx
// app/_components/Instructor/Students/StudentDetailsDialog/index.tsx
import { CheckCircle2, XCircle } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import { Progress } from "@/app/_components/_shared/ui/progress";
import {
	formatLastActive,
	getInitials,
	statusBadgeClass,
} from "../utils";
import type { StudentDetailsDialogProps } from "./types";

export function StudentDetailsDialog({
	student,
	open,
	onOpenChange,
}: StudentDetailsDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-2xl">
				{student && (
					<>
						<DialogHeader>
							<DialogTitle>Student Details</DialogTitle>
							<DialogDescription>
								View detailed information about this student
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-6 py-4">
							<div className="flex items-center gap-4">
								<Avatar className="h-16 w-16">
									<AvatarImage
										alt={student.name}
										src={student.image || undefined}
									/>
									<AvatarFallback className="bg-primary/10 text-primary text-xl">
										{getInitials(student.name)}
									</AvatarFallback>
								</Avatar>
								<div>
									<h3 className="font-semibold text-xl">{student.name}</h3>
									<p className="text-muted-foreground">{student.email}</p>
									<div className="mt-1 flex items-center gap-2">
										<Badge
											className={statusBadgeClass(student.status)}
											variant="outline"
										>
											{student.status.charAt(0).toUpperCase() +
												student.status.slice(1)}
										</Badge>
										<span className="text-muted-foreground text-sm">
											Joined{" "}
											{student.joinedAt.toLocaleDateString("en-US", {
												month: "short",
												day: "numeric",
												year: "numeric",
											})}
										</span>
									</div>
								</div>
							</div>

							<div className="rounded-lg border p-4">
								<div className="flex items-center justify-between">
									<span className="font-medium">Overall Progress</span>
									<span className="font-bold text-lg">
										{student.overallProgress}%
									</span>
								</div>
								<Progress
									className="mt-2 h-2"
									value={student.overallProgress}
								/>
								<p className="mt-2 text-muted-foreground text-sm">
									Last active: {formatLastActive(student.lastActiveAt)}
								</p>
							</div>

							<div>
								<h4 className="mb-3 font-medium">Enrolled Courses</h4>
								<div className="space-y-3">
									{student.courses.map((course) => (
										<div className="rounded-lg border p-4" key={course.courseId}>
											<div className="flex items-start justify-between">
												<div className="flex-1">
													<div className="flex items-center gap-2">
														<h5 className="font-medium">{course.title}</h5>
														<CourseStatusIcon
															completed={course.completed}
															progress={course.progress}
														/>
													</div>
													<div className="mt-2 flex items-center gap-3">
														<Progress
															className="flex-1"
															value={course.progress}
														/>
														<span className="font-medium text-sm">
															{course.progress}%
														</span>
													</div>
												</div>
											</div>
											<div className="mt-2">
												<Badge
													className={
														course.completed
															? "border-green-500/20 bg-green-500/10 text-green-600"
															: "border-blue-500/20 bg-blue-500/10 text-blue-600"
													}
													variant="outline"
												>
													{course.completed ? "Completed" : "In Progress"}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function CourseStatusIcon({
	completed,
	progress,
}: {
	completed: boolean;
	progress: number;
}) {
	if (completed) return <CheckCircle2 className="h-4 w-4 text-green-600" />;
	if (progress < 20) return <XCircle className="h-4 w-4 text-gray-400" />;
	return null;
}
```

> Note: `CourseStatusIcon`'s prop type is inline here only because the no-nested-ternary rule requires extracting it; if Biome/lint flags the inline type, move `CourseStatusIconProps` into `types.ts`.

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add app/_components/Instructor/Students/StudentDetailsDialog
git commit -m "feat(instructor): add StudentDetailsDialog component"
```

---

## Task 10: Frontend — students table component

**Files:**
- Create: `app/_components/Instructor/Students/StudentsTable/types.ts`
- Create: `app/_components/Instructor/Students/StudentsTable/index.tsx`

- [ ] **Step 1: Create the types**

```ts
// app/_components/Instructor/Students/StudentsTable/types.ts
import type { StudentRow } from "@/server/entities/instructor/students";

export type StudentsTableProps = {
	students: StudentRow[];
	isLoading: boolean;
	currentPage: number;
	lastPage: number;
	onPageChange: (page: number) => void;
	onViewDetails: (student: StudentRow) => void;
};

export type StudentTableRowProps = {
	student: StudentRow;
	onViewDetails: (student: StudentRow) => void;
};
```

- [ ] **Step 2: Create the component**

```tsx
// app/_components/Instructor/Students/StudentsTable/index.tsx
import { Eye, Mail, MoreHorizontal, Users } from "lucide-react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { formatLastActive, getInitials, statusBadgeClass } from "../utils";
import type { StudentsTableProps, StudentTableRowProps } from "./types";

function StudentTableRow({ student, onViewDetails }: StudentTableRowProps) {
	return (
		<tr className="border-b last:border-0 hover:bg-muted/30">
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Avatar className="h-10 w-10">
						<AvatarImage alt={student.name} src={student.image || undefined} />
						<AvatarFallback className="bg-primary/10 text-primary">
							{getInitials(student.name)}
						</AvatarFallback>
					</Avatar>
					<div>
						<p className="font-medium">{student.name}</p>
						<p className="text-muted-foreground text-sm">{student.email}</p>
					</div>
				</div>
			</td>
			<td className="px-6 py-4">
				<div className="flex flex-wrap gap-1">
					{student.courses.slice(0, 2).map((course) => (
						<Badge className="text-xs" key={course.courseId} variant="secondary">
							{course.title.length > 20
								? `${course.title.substring(0, 20)}...`
								: course.title}
						</Badge>
					))}
					{student.courses.length > 2 && (
						<Badge className="text-xs" variant="outline">
							+{student.courses.length - 2} more
						</Badge>
					)}
				</div>
			</td>
			<td className="px-6 py-4">
				<div className="flex items-center gap-3">
					<Progress className="w-24" value={student.overallProgress} />
					<span className="font-medium text-sm">
						{student.overallProgress}%
					</span>
				</div>
			</td>
			<td className="px-6 py-4">
				<span className="text-muted-foreground text-sm">
					{formatLastActive(student.lastActiveAt)}
				</span>
			</td>
			<td className="px-6 py-4">
				<Badge className={statusBadgeClass(student.status)} variant="outline">
					{student.status.charAt(0).toUpperCase() + student.status.slice(1)}
				</Badge>
			</td>
			<td className="px-6 py-4 text-right">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuLabel>Actions</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => onViewDetails(student)}>
							<Eye className="mr-2 h-4 w-4" />
							View Details
						</DropdownMenuItem>
						<DropdownMenuItem disabled>
							<Mail className="mr-2 h-4 w-4" />
							Send Message
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</td>
		</tr>
	);
}

export function StudentsTable({
	students,
	isLoading,
	currentPage,
	lastPage,
	onPageChange,
	onViewDetails,
}: StudentsTableProps) {
	return (
		<Card>
			<div className="overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b bg-muted/50">
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Student
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Enrolled Courses
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Progress
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Last Active
							</th>
							<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
								Status
							</th>
							<th className="px-6 py-4 text-right font-medium text-muted-foreground text-sm">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{students.map((student) => (
							<StudentTableRow
								key={student.id}
								onViewDetails={onViewDetails}
								student={student}
							/>
						))}
					</tbody>
				</table>
			</div>

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<p className="text-muted-foreground text-sm">Loading students…</p>
				</div>
			)}

			{!isLoading && students.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12">
					<Users className="h-12 w-12 text-muted-foreground" />
					<p className="mt-4 font-medium text-lg">No students found</p>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search or filter criteria
					</p>
				</div>
			)}

			{!isLoading && students.length > 0 && lastPage > 1 && (
				<div className="flex items-center justify-between border-t px-6 py-4">
					<span className="text-muted-foreground text-sm">
						Page {currentPage} of {lastPage}
					</span>
					<div className="flex gap-2">
						<Button
							disabled={currentPage <= 1}
							onClick={() => onPageChange(currentPage - 1)}
							size="sm"
							variant="outline"
						>
							Previous
						</Button>
						<Button
							disabled={currentPage >= lastPage}
							onClick={() => onPageChange(currentPage + 1)}
							size="sm"
							variant="outline"
						>
							Next
						</Button>
					</div>
				</div>
			)}
		</Card>
	);
}
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck && pnpm check:write
git add app/_components/Instructor/Students/StudentsTable
git commit -m "feat(instructor): add StudentsTable component with pagination"
```

---

## Task 11: Frontend — orchestrator and page wiring

**Files:**
- Create: `app/_components/Instructor/Students/types.ts`
- Create: `app/_components/Instructor/Students/index.tsx`
- Modify (replace): `app/instructor/students/page.tsx`

- [ ] **Step 1: Create the orchestrator types**

```ts
// app/_components/Instructor/Students/types.ts
import type {
	GetStudentsInput,
	StudentRow,
} from "@/server/entities/instructor/students";

export type StudentsQueryState = {
	q: string;
	status: GetStudentsInput["status"];
	courseId: string; // "all" or a course id
	sort: GetStudentsInput["sort"];
	page: number;
};

export type SelectedStudent = StudentRow | null;
```

- [ ] **Step 2: Create the orchestrator**

```tsx
// app/_components/Instructor/Students/index.tsx
"use client";

import { useEffect, useState } from "react";
import type { StudentRow } from "@/server/entities/instructor/students";
import { api } from "@/trpc/client";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { StudentDetailsDialog } from "./StudentDetailsDialog";
import { StudentsFilters } from "./StudentsFilters";
import { StudentsStatsCards } from "./StudentsStatsCards";
import { StudentsTable } from "./StudentsTable";
import type { StudentsQueryState } from "./types";

export function Students() {
	const [query, setQuery] = useState<StudentsQueryState>({
		q: "",
		status: "all",
		courseId: "all",
		sort: "recent",
		page: 1,
	});
	const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(
		null,
	);
	const [detailsOpen, setDetailsOpen] = useState(false);

	const debouncedSearch = useDebouncedValue(query.q, 300);

	// Reset to page 1 whenever a filter changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: page must not retrigger itself
	useEffect(() => {
		setQuery((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
	}, [debouncedSearch, query.status, query.courseId, query.sort]);

	const counts = api.instructor.getStudentStatusCounts.useQuery();
	const ownCourses = api.course.getOwnCourses.useQuery();
	const students = api.instructor.getStudents.useQuery({
		q: debouncedSearch || undefined,
		status: query.status,
		courseId: query.courseId === "all" ? undefined : query.courseId,
		sort: query.sort,
		page: query.page,
	});

	const handleViewDetails = (student: StudentRow) => {
		setSelectedStudent(student);
		setDetailsOpen(true);
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Students</h1>
				<p className="text-muted-foreground">
					Manage and track your students&apos; progress
				</p>
			</div>

			<StudentsStatsCards counts={counts.data} isLoading={counts.isLoading} />

			<StudentsFilters
				courseId={query.courseId}
				courses={(ownCourses.data ?? []).map((c) => ({
					id: c.id,
					title: c.title,
				}))}
				onCourseChange={(courseId) => setQuery((p) => ({ ...p, courseId }))}
				onSearchChange={(q) => setQuery((p) => ({ ...p, q }))}
				onSortChange={(sort) => setQuery((p) => ({ ...p, sort }))}
				onStatusChange={(status) => setQuery((p) => ({ ...p, status }))}
				search={query.q}
				sort={query.sort}
				status={query.status}
			/>

			<StudentsTable
				currentPage={students.data?.currentPage ?? 1}
				isLoading={students.isLoading}
				lastPage={students.data?.lastPage ?? 1}
				onPageChange={(page) => setQuery((p) => ({ ...p, page }))}
				onViewDetails={handleViewDetails}
				students={students.data?.data ?? []}
			/>

			<StudentDetailsDialog
				onOpenChange={setDetailsOpen}
				open={detailsOpen}
				student={selectedStudent}
			/>
		</div>
	);
}
```

- [ ] **Step 3: Replace the page**

Overwrite `app/instructor/students/page.tsx` entirely with:

```tsx
import { Students } from "@/app/_components/Instructor/Students";

export default function InstructorStudentsPage() {
	return <Students />;
}
```

- [ ] **Step 4: Verify no mock data remains**

Run: `grep -n "studentsData\|sarah.johnson\|professional-woman" app/instructor/students/page.tsx`
Expected: no output (mock arrays gone).

- [ ] **Step 5: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm check:write && pnpm build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Instructor/Students/types.ts app/_components/Instructor/Students/index.tsx app/instructor/students/page.tsx
git commit -m "feat(instructor): wire real data into the students page"
```

---

## Task 12: Manual verification

- [ ] **Step 1: Start the app and DB**

```bash
docker-compose up -d
pnpm dev
```

- [ ] **Step 2: Verify behaviour** (sign in as an instructor with students)

- Stats cards show real Total / Active / Completed / Inactive (sum equals Total). (FR1–FR3)
- The table lists the instructor's students with name, email, avatar/initials, the instructor's courses (max 2 + "+N more"), progress %, last-active relative time ("Never" when no access), and a status badge. (FR4–FR8)
- Searching by name/email narrows results; clearing restores. (FR10)
- Status filter restricts to the chosen derived status; course filter (instructor's courses only) restricts to enrolled students while rows still show all this-instructor courses. (FR11, FR12, FR5)
- Sort by Most Recent / Name / Progress reorders correctly; paging Previous/Next preserves filters. (FR13, FR14)
- "View Details" opens the dialog with the student's courses and per-course progress; no second network request fires. (FR15, FR16)
- An instructor with no students sees zeroed cards and the "No students found" empty state. (FR9)

- [ ] **Step 3: Cross-instructor isolation**

Sign in as a second instructor and confirm only their own students appear (no overlap). (FR17)

---

## Self-review notes (resolved during planning)

- **FR coverage:** FR1–FR3 → Tasks 3, 7; FR4–FR9 → Tasks 2, 9, 10; FR10–FR14 → Tasks 2, 8, 10, 11; FR15–FR16 → Tasks 2, 9; FR17 → Tasks 2, 3, 5 (instructor-scoped SQL + `instructorProcedure`).
- **Type consistency:** `RawStudentRow` (snake_case DB shape) is defined in Task 2 and consumed in Task 4; `StudentRow`/`StudentStatusCounts`/`GetStudentsInput` from Task 1 flow through service → router → components unchanged.
- **No placeholders:** every code step contains the full content; the only conditional note is the optional `CourseStatusIconProps` extraction in Task 9 if lint requires it.