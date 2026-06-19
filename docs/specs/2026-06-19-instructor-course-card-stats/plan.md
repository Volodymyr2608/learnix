# Instructor Course Card — Real Students/Rating/Revenue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three `"-"` placeholders on each `/instructor/courses` card (Students, Rating, Revenue) with that course's real, ownership-scoped numbers.

**Architecture:** Extend `courseRepository.searchOwnCourses`'s `select` with a relation `_count` for the student count (free, same query), add `paymentRepository.getRevenueByCourseIds` (mirrors the existing `getAvgRatingByCourseIds`), and have `courseService.searchOwnCourses` batch-fetch + merge rating and revenue into the rows it returns — the exact assembly shape `instructorService.getTopPerformingCourses` already uses.

**Tech Stack:** Next.js App Router, tRPC, Prisma, Vitest (unit + integration against `learnix_test` Postgres).

## Global Constraints

- "Students" = distinct enrollments with `status` in `[active, completed]`; `cancelled` is excluded (requirements.md decision #1, FR1).
- "Rating" = mean of non-deleted reviews for that course, `null` when there are none — never `0` (decision #2, FR2).
- "Revenue" = `SUM(amountCents)` over `status: succeeded, refundedAt: null` payments for that course (decision #3, FR3).
- A course with no enrollments/reviews/payments must resolve to `0` / `null` / `0`, never `undefined` or a thrown error (FR4).
- No new tRPC procedure, no schema change, no new files beyond what's listed per task (spec.md File list).
- Stats are computed only for the current page of `searchOwnCourses` results — never the instructor's full catalog (decision #5, FR6).

---

## Task 1: Extend `OwnCourseRow` with `students`, `rating`, `revenueCents`

**Files:**
- Modify: `server/entities/course/ownCourses.ts`

**Interfaces:**
- Produces: `Paginated<T>` (generic pagination wrapper), `OwnCourseRow` (final row shape, now with `students: number`, `rating: number | null`, `revenueCents: number`), `OwnCourseRepoRow` (`Omit<OwnCourseRow, "rating" | "revenueCents">` — what the repository can produce in one query), `PaginatedOwnCourses = Paginated<OwnCourseRow>`. Task 3 returns `Paginated<OwnCourseRepoRow>`; Task 4 returns `PaginatedOwnCourses`.

Type-only change; verified by `pnpm typecheck` (no runtime test — there's no behavior to assert yet).

- [ ] **Step 1: Replace the type definitions**

In `server/entities/course/ownCourses.ts`, replace the bottom two type definitions
(`OwnCourseRow` and `PaginatedOwnCourses`) with:

```ts
export type Paginated<T> = {
	data: T[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};

export type OwnCourseRow = {
	id: string;
	title: string;
	status: CourseStatus;
	updatedAt: Date;
	thumbnailUrl: string | null;
	students: number; // active + completed enrollments (FR1)
	rating: number | null; // avg review rating; null = no reviews yet → "—" (FR2)
	revenueCents: number; // lifetime gross revenue; 0 if no payments yet (FR3)
};

/** What `courseRepository.searchOwnCourses` can produce in a single query — rating and
 * revenue come from separate tables and are merged in by the service (Task 4). */
export type OwnCourseRepoRow = Omit<OwnCourseRow, "rating" | "revenueCents">;

export type PaginatedOwnCourses = Paginated<OwnCourseRow>;
```

The full file should now read:

```ts
import { z } from "zod";
import type { CourseStatus } from "@/generated/prisma";

export const getOwnCoursesInput = z.object({
	q: z.string().trim().max(200).optional(),
	status: z.enum(["all", "draft", "published"]).default("all"),
	category: z.string().optional(),
	sort: z
		.enum(["updated", "newest", "oldest", "title", "students"])
		.default("updated"),
	page: z.number().int().min(1).default(1),
});

export type GetOwnCoursesInput = z.infer<typeof getOwnCoursesInput>;

export type Paginated<T> = {
	data: T[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};

export type OwnCourseRow = {
	id: string;
	title: string;
	status: CourseStatus;
	updatedAt: Date;
	thumbnailUrl: string | null;
	students: number; // active + completed enrollments (FR1)
	rating: number | null; // avg review rating; null = no reviews yet → "—" (FR2)
	revenueCents: number; // lifetime gross revenue; 0 if no payments yet (FR3)
};

/** What `courseRepository.searchOwnCourses` can produce in a single query — rating and
 * revenue come from separate tables and are merged in by the service (Task 4). */
export type OwnCourseRepoRow = Omit<OwnCourseRow, "rating" | "revenueCents">;

export type PaginatedOwnCourses = Paginated<OwnCourseRow>;
```

- [ ] **Step 2: Confirm it doesn't typecheck yet (expected)**

Run: `pnpm typecheck`
Expected: FAIL — `server/repositories/course.repository.ts` no longer satisfies
`Promise<PaginatedOwnCourses>` (its `select` doesn't produce `students`/`rating`/
`revenueCents`). This is expected; Task 3 and Task 4 fix it.

- [ ] **Step 3: Commit**

```bash
git add server/entities/course/ownCourses.ts
git commit -m "feat(course): extend OwnCourseRow with students/rating/revenueCents"
```

---

## Task 2: `paymentRepository.getRevenueByCourseIds`

**Files:**
- Modify: `server/repositories/payment.repository.ts`
- Test: `server/repositories/payment.repository.integration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `paymentRepository.getRevenueByCourseIds(courseIds: string[]): Promise<Map<string, number>>` — keyed by `courseId`, value is lifetime gross cents; a course with no qualifying payments is **absent** from the map (caller defaults via `?? 0`). Task 4 consumes this.

Mirrors the existing `courseReviewRepository.getAvgRatingByCourseIds`: same `groupBy`-by-id-list shape, same empty-input short-circuit.

- [ ] **Step 1: Write the failing integration test**

In `server/repositories/payment.repository.integration.test.ts`, add inside the existing
`describe("PaymentRepository", ...)` block (it already has a local `makePayment` helper
and imports `makeCourse`, `makeUser`, `Role`, `paymentRepository` — reuse them):

```ts
	it("getRevenueByCourseIds sums succeeded, non-refunded payments per course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const c1 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const c2 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const c3 = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c1.id,
			amountCents: 3000,
			status: "succeeded",
			refundedAt: null,
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c1.id,
			amountCents: 2000,
			status: "succeeded",
			refundedAt: null,
		});
		// Refunded — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: c2.id,
			amountCents: 9000,
			status: "succeeded",
			refundedAt: new Date(),
		});

		const map = await paymentRepository.getRevenueByCourseIds([
			c1.id,
			c2.id,
			c3.id,
		]);

		expect(map.get(c1.id)).toBe(5000);
		expect(map.has(c2.id)).toBe(false); // refunded, excluded
		expect(map.has(c3.id)).toBe(false); // no qualifying payments
	});

	it("getRevenueByCourseIds returns an empty map for no ids", async () => {
		const map = await paymentRepository.getRevenueByCourseIds([]);
		expect(map.size).toBe(0);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/payment.repository.integration.test.ts`
Expected: FAIL — `getRevenueByCourseIds is not a function`.

- [ ] **Step 3: Implement the method**

In `server/repositories/payment.repository.ts`, add this method to the
`PaymentRepository` class, directly after `getRevenueGroupedByCourse` (before the
class's closing `}`):

```ts
	async getRevenueByCourseIds(
		courseIds: string[],
	): Promise<Map<string, number>> {
		if (courseIds.length === 0) return new Map();
		const grouped = await db.payment.groupBy({
			by: ["courseId"],
			where: {
				courseId: { in: courseIds },
				status: "succeeded",
				refundedAt: null,
			},
			_sum: { amountCents: true },
		});
		return new Map(
			grouped.map((g) => [g.courseId, g._sum.amountCents ?? 0]),
		);
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/payment.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/payment.repository.ts server/repositories/payment.repository.integration.test.ts
git commit -m "feat(course): add paymentRepository.getRevenueByCourseIds"
```

---

## Task 3: `courseRepository.searchOwnCourses` returns a real student count

**Files:**
- Modify: `server/repositories/course.repository.ts`
- Test: `server/repositories/course.repository.integration.test.ts`

**Interfaces:**
- Consumes: `OwnCourseRepoRow`, `Paginated` from `@/server/entities/course/ownCourses` (Task 1).
- Produces: `courseRepository.searchOwnCourses(...): Promise<Paginated<OwnCourseRepoRow>>` — each row now includes `students: number` (active + completed enrollment count). Task 4 consumes this.

- [ ] **Step 1: Write the failing integration test**

In `server/repositories/course.repository.integration.test.ts`, add this test inside the
existing `describe("CourseRepository.searchOwnCourses", ...)` block (it already imports
`EnrollmentStatus`, `makeEnrollment`, `makeUser`, `makeCourse`, `courseRepository`):

```ts
	it("returns the active+completed enrollment count as `students`, excluding cancelled", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Stats Course",
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: course.id });
		await makeEnrollment({
			studentId: s2.id,
			courseId: course.id,
			status: EnrollmentStatus.completed,
		});
		await makeEnrollment({
			studentId: s3.id,
			courseId: course.id,
			status: EnrollmentStatus.cancelled,
		});

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "updated",
			page: 1,
		});

		expect(res.data[0]?.students).toBe(2);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: FAIL — `res.data[0]?.students` is `undefined`, not `2`.

- [ ] **Step 3: Update the method's select, mapping, and return type**

In `server/repositories/course.repository.ts`:

First, update the type-only import at the top of the file:

```ts
import type {
	GetOwnCoursesInput,
	OwnCourseRepoRow,
	Paginated,
} from "@/server/entities/course/ownCourses";
```

Then replace the `searchOwnCourses` method body:

```ts
	async searchOwnCourses(
		params: GetOwnCoursesInput & { instructorId: string },
	): Promise<Paginated<OwnCourseRepoRow>> {
		const {
			instructorId,
			q,
			status = "all",
			category,
			sort = "updated",
			page = 1,
		} = params;

		const where: Prisma.CourseWhereInput = {
			instructorId,
			deletedAt: null,
			...(status !== "all" ? { status } : {}),
			...(category
				? { category: { equals: category, mode: "insensitive" } }
				: {}),
			...(q
				? {
						OR: [
							{ title: { contains: q, mode: "insensitive" } },
							{ subtitle: { contains: q, mode: "insensitive" } },
							{ description: { contains: q, mode: "insensitive" } },
						],
					}
				: {}),
		};

		const ORDER_BY: Record<
			GetOwnCoursesInput["sort"],
			Prisma.CourseOrderByWithRelationInput
		> = {
			updated: { updatedAt: "desc" },
			newest: { createdAt: "desc" },
			oldest: { createdAt: "asc" },
			title: { title: "asc" },
			students: { enrollments: { _count: "desc" } },
		};

		const [rows, total] = await Promise.all([
			this.findMany({
				where,
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					thumbnailUrl: true,
					_count: {
						select: {
							enrollments: {
								where: {
									status: {
										in: [EnrollmentStatus.active, EnrollmentStatus.completed],
									},
								},
							},
						},
					},
				},
				orderBy: ORDER_BY[sort],
				skip: (page - 1) * COURSE_PAGE_SIZE,
				take: COURSE_PAGE_SIZE,
			}),
			this.count(where),
		]);

		const data: OwnCourseRepoRow[] = rows.map((c) => ({
			id: c.id,
			title: c.title,
			status: c.status,
			updatedAt: c.updatedAt,
			thumbnailUrl: c.thumbnailUrl,
			students: c._count.enrollments,
		}));

		return {
			data,
			total,
			currentPage: page,
			lastPage: Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE)),
			perPage: COURSE_PAGE_SIZE,
		};
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: PASS — all tests in this file pass, including the pre-existing "sorts by most
students" test (unaffected by the `select` change).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/course.repository.ts server/repositories/course.repository.integration.test.ts
git commit -m "feat(course): searchOwnCourses returns active+completed student count"
```

---

## Task 4: `courseService.searchOwnCourses` merges rating and revenue

**Files:**
- Modify: `server/services/course/course.service.ts`
- Test: `server/services/course/course.integration.test.ts`

**Interfaces:**
- Consumes: `courseRepository.searchOwnCourses` (Task 3, returns `Paginated<OwnCourseRepoRow>`), `courseReviewRepository.getAvgRatingByCourseIds(courseIds: string[]): Promise<Map<string, number | null>>` (existing), `paymentRepository.getRevenueByCourseIds` (Task 2).
- Produces: `courseService.searchOwnCourses(instructorId: string, input: GetOwnCoursesInput): Promise<PaginatedOwnCourses>` — each row now has real `rating` and `revenueCents` merged in. This is what `course.searchOwnCourses` (the tRPC procedure, unchanged) returns to the client; Task 5 (`CourseCard`) consumes the resulting rows.

- [ ] **Step 1: Write the failing integration test**

In `server/services/course/course.integration.test.ts`, add this inside the existing
`describe("CourseService.searchOwnCourses", ...)` block (it already imports `testDb`,
`makeCourse`, `makeUser`, `Role`, and dynamically imports `courseService`):

```ts
	it("attaches real rating and revenue per course, defaulting to null/0 when absent", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const rated = await makeCourse({
			instructorId: instructor.id,
			title: "Rated",
		});
		const unrated = await makeCourse({
			instructorId: instructor.id,
			title: "Unrated",
		});
		const reviewer1 = await makeUser({ role: Role.STUDENT });
		const reviewer2 = await makeUser({ role: Role.STUDENT });
		const payer = await makeUser({ role: Role.STUDENT });

		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: reviewer1.id, rating: 5, comment: "great" },
		});
		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: reviewer2.id, rating: 3, comment: "ok" },
		});
		await testDb.payment.create({
			data: {
				studentId: payer.id,
				instructorId: instructor.id,
				courseId: rated.id,
				amountCents: 4000,
				status: "succeeded",
			},
		});

		const res = await courseService.searchOwnCourses(instructor.id, {
			status: "all",
			sort: "title",
			page: 1,
		});

		const byTitle = new Map(res.data.map((c) => [c.title, c]));
		expect(byTitle.get("Rated")).toMatchObject({ rating: 4, revenueCents: 4000 });
		expect(byTitle.get("Unrated")).toMatchObject({ rating: null, revenueCents: 0 });
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/services/course/course.integration.test.ts`
Expected: FAIL — `rating`/`revenueCents` are `undefined` on the returned rows.

- [ ] **Step 3: Implement the merge**

In `server/services/course/course.service.ts`, add the import for
`courseReviewRepository` (`paymentRepository` is already imported):

```ts
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
```

Then replace the `searchOwnCourses` method:

```ts
	async searchOwnCourses(
		instructorId: string,
		input: GetOwnCoursesInput,
	): Promise<PaginatedOwnCourses> {
		const page = await courseRepository.searchOwnCourses({
			...input,
			instructorId,
		});

		const ids = page.data.map((c) => c.id);
		const [ratings, revenue] = await Promise.all([
			courseReviewRepository.getAvgRatingByCourseIds(ids),
			paymentRepository.getRevenueByCourseIds(ids),
		]);

		return {
			...page,
			data: page.data.map((c) => ({
				...c,
				rating: ratings.get(c.id) ?? null,
				revenueCents: revenue.get(c.id) ?? 0,
			})),
		};
	}
```

`ids` is `[]` when the page has no rows; both `getAvgRatingByCourseIds` and
`getRevenueByCourseIds` short-circuit to an empty `Map` for an empty input without
touching the database, so an empty page never issues the extra queries.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/services/course/course.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full typecheck**

Run: `pnpm typecheck`
Expected: PASS — this resolves the failure introduced in Task 1, Step 2.

- [ ] **Step 6: Commit**

```bash
git add server/services/course/course.service.ts server/services/course/course.integration.test.ts
git commit -m "feat(course): searchOwnCourses merges real rating and revenue"
```

---

## Task 5: `CourseCard` renders real Students/Rating/Revenue

**Files:**
- Modify: `app/_components/Course/components/CourseCard/index.tsx`

**Interfaces:**
- Consumes: `course.students: number`, `course.rating: number | null`, `course.revenueCents: number` (all on `OwnCourse`, which is `PaginatedOwnCourses["data"][number]` — flows automatically from Task 1's `OwnCourseRow`). `formatUsd(cents: number): string` from `@/lib/formatUsd` (existing, already used by `TopCourseRow`).

No new test file — this codebase has no render tests for any of its display cards
(`TopCourseRow`, `RecentActivity`'s `ActivityRow`, etc.); correctness here is covered by
Task 1–4's tests plus `pnpm typecheck` and the manual scenario in `validation.md`.

- [ ] **Step 1: Add the `formatUsd` import**

In `app/_components/Course/components/CourseCard/index.tsx`, insert the import in
Biome's sorted position — alphabetically between `@/lib/constants/urls/instructorUrls`
and `@/lib/utils/date/updatedLabel`:

```ts
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { formatUsd } from "@/lib/formatUsd";
import updatedLabel from "@/lib/utils/date/updatedLabel";
```

- [ ] **Step 2: Replace the three placeholder stats**

Replace:

```tsx
				<div className="grid grid-cols-3 gap-4 text-center">
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Students</p>
					</div>
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Rating</p>
					</div>
					<div>
						<p className="font-bold text-2xl">{"-"}</p>
						<p className="text-muted-foreground text-xs">Revenue</p>
					</div>
				</div>
```

With:

```tsx
				<div className="grid grid-cols-3 gap-4 text-center">
					<div>
						<p className="font-bold text-2xl">{course.students}</p>
						<p className="text-muted-foreground text-xs">Students</p>
					</div>
					<div>
						<p className="font-bold text-2xl">
							{course.rating === null ? "—" : course.rating.toFixed(1)}
						</p>
						<p className="text-muted-foreground text-xs">Rating</p>
					</div>
					<div>
						<p className="font-bold text-2xl">
							{formatUsd(course.revenueCents)}
						</p>
						<p className="text-muted-foreground text-xs">Revenue</p>
					</div>
				</div>
```

(The rating ternary is a single binary branch — allowed under `CLAUDE.md`'s
no-nested-ternary rule.)

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm check`
Expected: both clean.

- [ ] **Step 4: Manual verification**

```bash
docker-compose up -d
pnpm dev
```

Sign in as an instructor with at least one published course that has enrollments,
reviews, and a succeeded payment, plus one brand-new draft with none of those. Open
`/instructor/courses` and confirm:
- The course with activity shows its real student count, a one-decimal rating, and a
  `$`-formatted revenue figure.
- The brand-new draft shows `0`, `—`, and `$0` — no `"-"` anywhere.

- [ ] **Step 5: Commit**

```bash
git add app/_components/Course/components/CourseCard/index.tsx
git commit -m "feat(course): render real students/rating/revenue on CourseCard"
```

---

## Self-Review Notes

- **Spec coverage:** FR1 (students) → Task 3; FR2 (rating) → Task 4 (reuses existing
  `getAvgRatingByCourseIds`); FR3 (revenue) → Task 2 + Task 4; FR4 (zero/`—` defaults) →
  Task 4's merge (`?? null` / `?? 0`) + Task 5's manual scenario; FR5 (ownership) —
  unchanged, already enforced by `searchOwnCourses`'s `where: { instructorId }`, no new
  task needed; FR6 (correct across filters) — covered implicitly since Task 3/4 operate
  on whatever page `searchOwnCourses` already filtered/sorted, no separate logic per
  filter.
- **Type consistency:** `OwnCourseRow` (Task 1) → `OwnCourseRepoRow` (Task 1, consumed by
  Task 3) → `Paginated<OwnCourseRepoRow>` (Task 3 return type) → merged into
  `PaginatedOwnCourses` (Task 4 return type) → `OwnCourse` (`CourseCard`'s existing prop
  type, Task 5) — verified the field names (`students`, `rating`, `revenueCents`) are
  identical at every hop.
- **No placeholders:** every step has runnable code and exact commands.