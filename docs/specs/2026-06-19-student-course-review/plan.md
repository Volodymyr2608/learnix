# Student Course Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student who completed a course submit one rating + comment (+ optional tags) review, persist it, surface it on the course detail page and as real average ratings on browse cards.

**Architecture:** New `review` tRPC router → `ReviewService` → existing `CourseReviewRepository`. Eligibility reuses `Enrollment.status === completed`. Tags become a Prisma enum array. The mock review page is split into a server component (eligibility → redirect / read-only / form) + a client form. Browse cards switch from a hardcoded rating to the real batched average.

**Tech Stack:** Next.js 16 App Router (server components), tRPC, Prisma (pgvector unrelated), Zod, Better Auth, Vitest, Biome.

## Global Constraints

- **Layering (ADR-003):** routers → services → repositories. Services never touch Prisma directly; all data access via repositories.
- **Authz (ADR-004):** both review procedures are `studentProcedure`; `studentId` always comes from `ctx.session.user.id`, never from client input.
- **Errors (ADR-010):** services throw `ReviewError extends DomainError`; routers wrap calls in `try/catch` and call `handleServiceError(error)`.
- **Components (ADR-011):** every component folder has a colocated `types.ts`; no inline prop types; no nested ternaries in JSX (use early-return sub-components); flatten loading/branch states.
- **Tooling:** Biome via `pnpm check:write`; `pnpm typecheck` must pass. Unit tests `*.test.ts` (no DB), integration `*.integration.test.ts` (needs `learnix_test`).
- **Tags enum values (fixed):** `COURSE_CONTENT`, `INSTRUCTOR`, `PRACTICAL_EXAMPLES`, `PACE`, `RESOURCES`, `EXERCISES`.
- **Submission rules:** rating integer 1–5 (required); comment ≥ 50 chars (required); tags optional (may be empty).

---

### Task 1: Add `ReviewTag` enum + `tags` column to the schema

**Files:**
- Modify: `prisma/schema/review.prisma`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma enum `ReviewTag` and `CourseReview.tags: ReviewTag[]` (default `[]`), available on the generated client and in `prisma/zod`.

- [ ] **Step 1: Add the enum and column**

In `prisma/schema/review.prisma`, add the enum above the model and the `tags` field inside `CourseReview` (after `comment`):

```prisma
enum ReviewTag {
  COURSE_CONTENT
  INSTRUCTOR
  PRACTICAL_EXAMPLES
  PACE
  RESOURCES
  EXERCISES

  @@map("review_tag")
}

model CourseReview {
  id String @id @default(cuid())

  courseId String
  course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  studentId String
  student   User   @relation(fields: [studentId], references: [id], onDelete: Cascade)

  rating  Int
  comment String      @db.Text
  tags    ReviewTag[] @default([])

  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")

  @@unique([courseId, studentId])
  @@index([courseId])
  @@index([studentId])
  @@index([deletedAt])
  @@map("course_reviews")
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
When prompted for a name, enter: `add_review_tags`
Expected: a new folder under `prisma/migrations/` containing `CREATE TYPE "review_tag"` and `ALTER TABLE "course_reviews" ADD COLUMN "tags"`.

- [ ] **Step 3: Regenerate the client + zod types**

Run: `pnpm generate`
Expected: completes without error; `ReviewTag` is now importable from `@/generated/prisma`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no usages yet, just confirms client regenerated cleanly).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema/review.prisma prisma/migrations prisma/zod generated
git commit -m "feat(review): add ReviewTag enum and tags column to CourseReview"
```

---

### Task 2: Review DTOs and types

**Files:**
- Create: `server/entities/review/review.dto.ts`
- Create: `server/entities/review/review.dto.test.ts`

**Interfaces:**
- Consumes: `ReviewTag` from `@/generated/prisma`.
- Produces:
  - `createReviewInput` (Zod schema) and `type CreateReviewInput`
  - `reviewTagSchema`
  - `type CourseSummary`, `type ReviewView`, `type EligibilityResult` (consumed by the service, router, and page).

- [ ] **Step 1: Write the failing test**

Create `server/entities/review/review.dto.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ReviewTag } from "@/generated/prisma";
import { createReviewInput } from "./review.dto";

describe("createReviewInput", () => {
	const valid = {
		courseId: "course_1",
		rating: 5,
		comment: "x".repeat(50),
		tags: [ReviewTag.PACE],
	};

	it("accepts a valid payload", () => {
		expect(createReviewInput.parse(valid)).toEqual(valid);
	});

	it("defaults tags to an empty array when omitted", () => {
		const { tags, ...withoutTags } = valid;
		expect(createReviewInput.parse(withoutTags).tags).toEqual([]);
	});

	it("rejects rating outside 1..5", () => {
		expect(() => createReviewInput.parse({ ...valid, rating: 0 })).toThrow();
		expect(() => createReviewInput.parse({ ...valid, rating: 6 })).toThrow();
	});

	it("rejects a non-integer rating", () => {
		expect(() => createReviewInput.parse({ ...valid, rating: 4.5 })).toThrow();
	});

	it("rejects a comment shorter than 50 characters", () => {
		expect(() =>
			createReviewInput.parse({ ...valid, comment: "too short" }),
		).toThrow();
	});

	it("rejects an unknown tag", () => {
		expect(() =>
			createReviewInput.parse({ ...valid, tags: ["NOT_A_TAG"] }),
		).toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/entities/review/review.dto.test.ts`
Expected: FAIL — cannot resolve `./review.dto`.

- [ ] **Step 3: Implement the DTOs**

Create `server/entities/review/review.dto.ts`:

```ts
import { z } from "zod";
import { ReviewTag } from "@/generated/prisma";

export const reviewTagSchema = z.nativeEnum(ReviewTag);

export const createReviewInput = z.object({
	courseId: z.string().min(1),
	rating: z.number().int().min(1).max(5),
	comment: z.string().min(50),
	tags: z.array(reviewTagSchema).default([]),
});

export type CreateReviewInput = z.infer<typeof createReviewInput>;

export type CourseSummary = {
	id: string;
	title: string;
	instructor: string;
	completedDate: string;
	totalLessons: number;
	duration: string;
};

export type ReviewView = {
	rating: number;
	comment: string;
	tags: ReviewTag[];
	createdAt: string;
};

export type EligibilityResult =
	| { state: "ineligible" }
	| { state: "alreadyReviewed"; review: ReviewView; course: CourseSummary }
	| { state: "eligible"; course: CourseSummary };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/entities/review/review.dto.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint + commit**

```bash
pnpm check:write server/entities/review
git add server/entities/review
git commit -m "feat(review): add review DTOs and eligibility types"
```

---

### Task 3: Repository finder + error type

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Create: `server/services/review/review.errors.ts`
- Modify: `server/repositories/courseReview.repository.integration.test.ts`

**Interfaces:**
- Consumes: `BaseRepository.create`, `BaseRepository.findFirst` (already available).
- Produces:
  - `courseReviewRepository.findByStudentAndCourse(studentId: string, courseId: string): Promise<CourseReview | null>` (ignores soft-deleted).
  - `class ReviewError extends DomainError`.

- [ ] **Step 1: Write the failing integration test**

Append to `server/repositories/courseReview.repository.integration.test.ts`:

```ts
describe("CourseReviewRepository.findByStudentAndCourse", () => {
	it("returns the active review for a student/course pair", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: student.id, rating: 4 });

		const found = await courseReviewRepository.findByStudentAndCourse(
			student.id,
			course.id,
		);

		expect(found?.rating).toBe(4);
	});

	it("ignores soft-deleted reviews", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const student = await makeUser({ role: Role.STUDENT });
		await makeReview({
			courseId: course.id,
			studentId: student.id,
			rating: 4,
			deletedAt: new Date(),
		});

		const found = await courseReviewRepository.findByStudentAndCourse(
			student.id,
			course.id,
		);

		expect(found).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: FAIL — `findByStudentAndCourse is not a function`.
(Requires `learnix_test` DB — see `.env.test.example`.)

- [ ] **Step 3: Add the finder method**

In `server/repositories/courseReview.repository.ts`, add this method inside the class (above the closing brace, after the existing methods):

```ts
	findByStudentAndCourse(
		studentId: string,
		courseId: string,
	): Promise<CourseReview | null> {
		return this.findFirst({
			where: { studentId, courseId, deletedAt: null },
		});
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the error type**

Create `server/services/review/review.errors.ts`:

```ts
import { DomainError } from "@/server/services/base/base.errors";

export class ReviewError extends DomainError {}
```

- [ ] **Step 6: Lint + commit**

```bash
pnpm check:write server/repositories/courseReview.repository.ts server/services/review/review.errors.ts server/repositories/courseReview.repository.integration.test.ts
git add server/repositories/courseReview.repository.ts server/repositories/courseReview.repository.integration.test.ts server/services/review/review.errors.ts
git commit -m "feat(review): add findByStudentAndCourse and ReviewError"
```

---

### Task 4: ReviewService (eligibility + create)

**Files:**
- Create: `server/services/review/review.service.ts`
- Create: `server/services/review/review.service.test.ts`

**Interfaces:**
- Consumes:
  - `enrollmentRepository.findByStudentCourse(studentId, courseId)` → enrollment with scalar fields `status`, `updatedAt` (or `null`).
  - `courseReviewRepository.findByStudentAndCourse(studentId, courseId)` → `CourseReview | null`.
  - `courseReviewRepository.create(data)` → created `CourseReview`.
  - `courseRepository.findFirst({ where, select })`.
  - `CreateReviewInput`, `EligibilityResult`, `CourseSummary` from `@/server/entities/review/review.dto`.
- Produces:
  - `reviewService.getEligibility(studentId: string, courseId: string): Promise<EligibilityResult>`
  - `reviewService.createReview(studentId: string, input: CreateReviewInput): Promise<{ id: string }>`

- [ ] **Step 1: Write the failing unit test**

Create `server/services/review/review.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, ReviewTag } from "@/generated/prisma";

const mockEnrollmentRepo = { findByStudentCourse: vi.fn() };
const mockReviewRepo = {
	findByStudentAndCourse: vi.fn(),
	create: vi.fn(),
};
const mockCourseRepo = { findFirst: vi.fn() };

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
vi.mock("@/server/repositories/courseReview.repository", () => ({
	courseReviewRepository: mockReviewRepo,
}));
vi.mock("@/server/repositories/course.repository", () => ({
	courseRepository: mockCourseRepo,
}));

import { reviewService } from "./review.service";

const courseRow = {
	id: "course_1",
	title: "Python",
	duration: "15 hours",
	instructor: { name: "David Kim" },
	sections: [
		{ lessons: [{ id: "l1" }, { id: "l2" }] },
		{ lessons: [{ id: "l3" }] },
	],
};

const completedEnrollment = {
	status: EnrollmentStatus.completed,
	updatedAt: new Date("2024-03-15T00:00:00Z"),
};

beforeEach(() => {
	vi.clearAllMocks();
	mockCourseRepo.findFirst.mockResolvedValue(courseRow);
});

describe("reviewService.getEligibility", () => {
	it("returns ineligible when there is no enrollment", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(null);

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result).toEqual({ state: "ineligible" });
	});

	it("returns ineligible when the enrollment is not completed", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue({
			status: EnrollmentStatus.active,
			updatedAt: new Date(),
		});

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result).toEqual({ state: "ineligible" });
	});

	it("returns eligible with a course summary when completed and not reviewed", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(completedEnrollment);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue(null);

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result.state).toBe("eligible");
		if (result.state !== "eligible") throw new Error("unreachable");
		expect(result.course.totalLessons).toBe(3);
		expect(result.course.instructor).toBe("David Kim");
	});

	it("returns alreadyReviewed with the existing review", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(completedEnrollment);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue({
			rating: 4,
			comment: "great",
			tags: [ReviewTag.PACE],
			createdAt: new Date("2024-03-16T00:00:00Z"),
		});

		const result = await reviewService.getEligibility("stu_1", "course_1");

		expect(result.state).toBe("alreadyReviewed");
		if (result.state !== "alreadyReviewed") throw new Error("unreachable");
		expect(result.review.rating).toBe(4);
		expect(result.review.tags).toEqual([ReviewTag.PACE]);
	});
});

describe("reviewService.createReview", () => {
	const input = {
		courseId: "course_1",
		rating: 5,
		comment: "x".repeat(50),
		tags: [ReviewTag.INSTRUCTOR],
	};

	it("throws FORBIDDEN when the student has not completed the course", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue({
			status: EnrollmentStatus.active,
			updatedAt: new Date(),
		});

		await expect(reviewService.createReview("stu_1", input)).rejects.toMatchObject(
			{ code: "FORBIDDEN" },
		);
		expect(mockReviewRepo.create).not.toHaveBeenCalled();
	});

	it("throws CONFLICT when a review already exists", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(completedEnrollment);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue({ id: "rev_1" });

		await expect(reviewService.createReview("stu_1", input)).rejects.toMatchObject(
			{ code: "CONFLICT" },
		);
		expect(mockReviewRepo.create).not.toHaveBeenCalled();
	});

	it("creates the review and returns its id", async () => {
		mockEnrollmentRepo.findByStudentCourse.mockResolvedValue(completedEnrollment);
		mockReviewRepo.findByStudentAndCourse.mockResolvedValue(null);
		mockReviewRepo.create.mockResolvedValue({ id: "rev_new" });

		const result = await reviewService.createReview("stu_1", input);

		expect(result).toEqual({ id: "rev_new" });
		expect(mockReviewRepo.create).toHaveBeenCalledWith({
			studentId: "stu_1",
			courseId: "course_1",
			rating: 5,
			comment: input.comment,
			tags: [ReviewTag.INSTRUCTOR],
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit server/services/review/review.service.test.ts`
Expected: FAIL — cannot resolve `./review.service`.

- [ ] **Step 3: Implement the service**

Create `server/services/review/review.service.ts`:

```ts
import { EnrollmentStatus } from "@/generated/prisma";
import type {
	CourseSummary,
	CreateReviewInput,
	EligibilityResult,
} from "@/server/entities/review/review.dto";
import { courseRepository } from "@/server/repositories/course.repository";
import { courseReviewRepository } from "@/server/repositories/courseReview.repository";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { ReviewError } from "@/server/services/review/review.errors";
import { logger } from "@/server/utils/logger";

class ReviewService {
	async getEligibility(
		studentId: string,
		courseId: string,
	): Promise<EligibilityResult> {
		const enrollment = await enrollmentRepository.findByStudentCourse(
			studentId,
			courseId,
		);

		if (!enrollment || enrollment.status !== EnrollmentStatus.completed) {
			return { state: "ineligible" };
		}

		const course = await this.buildCourseSummary(courseId, enrollment.updatedAt);
		if (!course) {
			return { state: "ineligible" };
		}

		const existing = await courseReviewRepository.findByStudentAndCourse(
			studentId,
			courseId,
		);

		if (existing) {
			return {
				state: "alreadyReviewed",
				course,
				review: {
					rating: existing.rating,
					comment: existing.comment,
					tags: existing.tags,
					createdAt: existing.createdAt.toISOString(),
				},
			};
		}

		return { state: "eligible", course };
	}

	async createReview(
		studentId: string,
		input: CreateReviewInput,
	): Promise<{ id: string }> {
		try {
			const enrollment = await enrollmentRepository.findByStudentCourse(
				studentId,
				input.courseId,
			);

			if (!enrollment || enrollment.status !== EnrollmentStatus.completed) {
				throw new ReviewError(
					"You can only review a course you have completed",
					"FORBIDDEN",
					undefined,
					{ studentId, courseId: input.courseId },
				);
			}

			const existing = await courseReviewRepository.findByStudentAndCourse(
				studentId,
				input.courseId,
			);

			if (existing) {
				throw new ReviewError(
					"You have already reviewed this course",
					"CONFLICT",
					undefined,
					{ studentId, courseId: input.courseId },
				);
			}

			const created = await courseReviewRepository.create({
				studentId,
				courseId: input.courseId,
				rating: input.rating,
				comment: input.comment,
				tags: input.tags,
			});

			return { id: created.id };
		} catch (error) {
			if (error instanceof ReviewError) throw error;
			logger.error("Failed to create review", { studentId, error });
			throw new ReviewError(
				"Failed to create review",
				"INTERNAL_SERVER_ERROR",
				error,
				{ studentId, courseId: input.courseId },
			);
		}
	}

	private async buildCourseSummary(
		courseId: string,
		completedAt: Date,
	): Promise<CourseSummary | null> {
		const course = await courseRepository.findFirst({
			where: { id: courseId, deletedAt: null },
			select: {
				id: true,
				title: true,
				duration: true,
				instructor: { select: { name: true } },
				sections: {
					where: { deletedAt: null },
					select: {
						lessons: { where: { deletedAt: null }, select: { id: true } },
					},
				},
			},
		});

		if (!course) return null;

		const totalLessons = course.sections.reduce(
			(sum: number, section: { lessons: unknown[] }) =>
				sum + section.lessons.length,
			0,
		);

		return {
			id: course.id,
			title: course.title,
			instructor: course.instructor.name,
			completedDate: completedAt.toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			}),
			totalLessons,
			duration: course.duration,
		};
	}
}

export const reviewService = new ReviewService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit server/services/review/review.service.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint + commit**

```bash
pnpm check:write server/services/review
git add server/services/review
git commit -m "feat(review): add ReviewService with eligibility and create"
```

---

### Task 5: tRPC review router

**Files:**
- Create: `server/api/routers/review.ts`
- Modify: `server/api/root.ts`

**Interfaces:**
- Consumes: `reviewService.getEligibility`, `reviewService.createReview`, `createReviewInput`, `handleServiceError`, `studentProcedure`.
- Produces: `reviewRouter` with `getEligibility` (query, input `{ courseId }`) and `create` (mutation, input `createReviewInput`), registered as `review` on `appRouter`.

- [ ] **Step 1: Create the router**

Create `server/api/routers/review.ts`:

```ts
import { z } from "zod";
import { createReviewInput } from "@/server/entities/review/review.dto";
import { reviewService } from "@/server/services/review/review.service";
import { handleServiceError } from "@/server/utils/handleServiceError";
import { createTRPCRouter, studentProcedure } from "../trpc";

export const reviewRouter = createTRPCRouter({
	getEligibility: studentProcedure
		.input(z.object({ courseId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			try {
				return await reviewService.getEligibility(
					ctx.session.user.id,
					input.courseId,
				);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	create: studentProcedure
		.input(createReviewInput)
		.mutation(async ({ ctx, input }) => {
			try {
				return await reviewService.createReview(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
});
```

- [ ] **Step 2: Register the router**

In `server/api/root.ts`, add the import (keep alphabetical grouping with the others) and the entry in `createTRPCRouter`:

```ts
import { reviewRouter } from "@/server/api/routers/review";
```

```ts
	quiz: quizRouter,
	review: reviewRouter,
	search: searchRouter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `api.review.getEligibility` / `api.review.create` are now typed on both server and client callers.

- [ ] **Step 4: Lint + commit**

```bash
pnpm check:write server/api/routers/review.ts server/api/root.ts
git add server/api/routers/review.ts server/api/root.ts
git commit -m "feat(review): add review tRPC router"
```

---

### Task 6: Read-only review component

**Files:**
- Create: `app/dashboard/courses/[courseId]/review/components/ReviewReadOnly/index.tsx`
- Create: `app/dashboard/courses/[courseId]/review/components/ReviewReadOnly/types.ts`

**Interfaces:**
- Consumes: `CourseSummary`, `ReviewView` from `@/server/entities/review/review.dto`.
- Produces: default-exported `ReviewReadOnly` component (`{ course, review }`).

- [ ] **Step 1: Define prop types**

Create `app/dashboard/courses/[courseId]/review/components/ReviewReadOnly/types.ts`:

```ts
import type { CourseSummary, ReviewView } from "@/server/entities/review/review.dto";

export type ReviewReadOnlyProps = {
	course: CourseSummary;
	review: ReviewView;
};
```

- [ ] **Step 2: Implement the component**

Create `app/dashboard/courses/[courseId]/review/components/ReviewReadOnly/index.tsx`:

```tsx
import { Star } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { ReviewReadOnlyProps } from "./types";

const ReviewReadOnly = ({ course, review }: ReviewReadOnlyProps) => {
	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div>
				<h1 className="font-bold text-2xl tracking-tight">Your Review</h1>
				<p className="text-muted-foreground text-sm">
					You already reviewed {course.title}
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-xl">{course.title}</CardTitle>
					<CardDescription>by {course.instructor}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-1">
						{[1, 2, 3, 4, 5].map((star) => (
							<Star
								className={
									star <= review.rating
										? "h-6 w-6 fill-yellow-400 text-yellow-400"
										: "h-6 w-6 text-muted-foreground"
								}
								key={star}
							/>
						))}
					</div>
					<p className="text-muted-foreground text-sm">{review.comment}</p>
					{review.tags.length > 0 && (
						<div className="flex flex-wrap gap-2">
							{review.tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag.replace(/_/g, " ").toLowerCase()}
								</Badge>
							))}
						</div>
					)}
					<Button asChild variant="outline">
						<Link href="/dashboard/courses">Back to My Courses</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
};

export default ReviewReadOnly;
```

- [ ] **Step 3: Typecheck + lint + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
pnpm check:write "app/dashboard/courses/[courseId]/review/components/ReviewReadOnly"
git add "app/dashboard/courses/[courseId]/review/components/ReviewReadOnly"
git commit -m "feat(review): add read-only review component"
```

---

### Task 7: Review form component (owns the create mutation)

**Files:**
- Create: `app/dashboard/courses/[courseId]/review/components/ReviewForm/index.tsx`
- Create: `app/dashboard/courses/[courseId]/review/components/ReviewForm/types.ts`

**Interfaces:**
- Consumes: `CourseSummary` from the DTO; `ReviewTag` from `@/generated/prisma`; `api` from `@/trpc/client`.
- Produces: default-exported client `ReviewForm` component (`{ course }`).

- [ ] **Step 1: Define prop types and tag options**

Create `app/dashboard/courses/[courseId]/review/components/ReviewForm/types.ts`:

```ts
import type { ReviewTag } from "@/generated/prisma";
import type { CourseSummary } from "@/server/entities/review/review.dto";

export type ReviewFormProps = {
	course: CourseSummary;
};

export type TagOption = {
	value: ReviewTag;
	label: string;
};
```

- [ ] **Step 2: Implement the form**

Create `app/dashboard/courses/[courseId]/review/components/ReviewForm/index.tsx`:

```tsx
"use client";

import { CheckCircle2, ChevronLeft, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Label } from "@/app/_components/_shared/ui/label";
import { Textarea } from "@/app/_components/_shared/ui/textarea";
import { ReviewTag } from "@/generated/prisma";
import { api } from "@/trpc/client";
import type { ReviewFormProps, TagOption } from "./types";

const TAG_OPTIONS: TagOption[] = [
	{ value: ReviewTag.COURSE_CONTENT, label: "Course Content" },
	{ value: ReviewTag.INSTRUCTOR, label: "Instructor" },
	{ value: ReviewTag.PRACTICAL_EXAMPLES, label: "Practical Examples" },
	{ value: ReviewTag.PACE, label: "Pace" },
	{ value: ReviewTag.RESOURCES, label: "Resources" },
	{ value: ReviewTag.EXERCISES, label: "Exercises" },
];

const RATING_LABELS: Record<number, string> = {
	1: "Poor",
	2: "Fair",
	3: "Good",
	4: "Very Good",
	5: "Excellent!",
};

const ReviewForm = ({ course }: ReviewFormProps) => {
	const [rating, setRating] = useState(0);
	const [hoveredRating, setHoveredRating] = useState(0);
	const [comment, setComment] = useState("");
	const [tags, setTags] = useState<ReviewTag[]>([]);

	const createReview = api.review.create.useMutation({
		onError: (err) => {
			toast.error(err.message || "Failed to submit review. Please try again.");
		},
	});

	const toggleTag = (tag: ReviewTag) => {
		setTags((current) =>
			current.includes(tag)
				? current.filter((t) => t !== tag)
				: [...current, tag],
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		createReview.mutate({ courseId: course.id, rating, comment, tags });
	};

	if (createReview.isSuccess) {
		return (
			<div className="flex min-h-[60vh] items-center justify-center">
				<Card className="w-full max-w-md">
					<CardContent className="pt-6">
						<div className="flex flex-col items-center space-y-4 text-center">
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
								<CheckCircle2 className="h-8 w-8 text-primary" />
							</div>
							<div className="space-y-2">
								<h2 className="font-bold text-2xl">Thank You!</h2>
								<p className="text-muted-foreground">
									Your review has been submitted successfully. Your feedback
									helps other learners choose the right course.
								</p>
							</div>
							<div className="flex gap-3">
								<Button asChild variant="outline">
									<Link href="/dashboard/courses">Back to My Courses</Link>
								</Button>
								<Button asChild>
									<Link href="/dashboard/browse">Browse More Courses</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6">
			<div className="flex items-center gap-2">
				<Button asChild size="icon" variant="ghost">
					<Link href="/dashboard/courses">
						<ChevronLeft className="h-4 w-4" />
					</Link>
				</Button>
				<div>
					<h1 className="font-bold text-2xl tracking-tight">Review Course</h1>
					<p className="text-muted-foreground text-sm">
						Share your experience with other learners
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div className="space-y-1">
							<CardTitle className="text-xl">{course.title}</CardTitle>
							<CardDescription>by {course.instructor}</CardDescription>
						</div>
						<Badge variant="default">Completed</Badge>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex gap-6 text-muted-foreground text-sm">
						<div>
							<span className="font-medium">Completed:</span>{" "}
							{course.completedDate}
						</div>
						<div>
							<span className="font-medium">Lessons:</span> {course.totalLessons}
						</div>
						<div>
							<span className="font-medium">Duration:</span> {course.duration}
						</div>
					</div>
				</CardContent>
			</Card>

			<form onSubmit={handleSubmit}>
				<Card>
					<CardHeader>
						<CardTitle>Your Review</CardTitle>
						<CardDescription>
							Help others by sharing your honest feedback
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-2">
							<Label>Overall Rating *</Label>
							<div className="flex items-center gap-2">
								{[1, 2, 3, 4, 5].map((star) => (
									<button
										className="transition-transform hover:scale-110"
										key={star}
										onClick={() => setRating(star)}
										onMouseEnter={() => setHoveredRating(star)}
										onMouseLeave={() => setHoveredRating(0)}
										type="button"
									>
										<Star
											className={
												star <= (hoveredRating || rating)
													? "h-8 w-8 fill-yellow-400 text-yellow-400"
													: "h-8 w-8 text-muted-foreground"
											}
										/>
									</button>
								))}
								{rating > 0 && (
									<span className="ml-2 font-medium text-sm">
										{RATING_LABELS[rating]}
									</span>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="review">Your Review *</Label>
							<Textarea
								id="review"
								onChange={(e) => setComment(e.target.value)}
								placeholder="Share your experience with this course. What did you like? What could be improved?"
								required
								rows={6}
								value={comment}
							/>
							<p className="text-muted-foreground text-xs">Minimum 50 characters</p>
						</div>

						<div className="space-y-2">
							<Label>What did you like most? (Optional)</Label>
							<div className="flex flex-wrap gap-2">
								{TAG_OPTIONS.map((tag) => (
									<Button
										key={tag.value}
										onClick={() => toggleTag(tag.value)}
										size="sm"
										type="button"
										variant={tags.includes(tag.value) ? "default" : "outline"}
									>
										{tag.label}
									</Button>
								))}
							</div>
						</div>

						<div className="flex gap-3 pt-4">
							<Button
								asChild
								className="flex-1 bg-transparent"
								type="button"
								variant="outline"
							>
								<Link href="/dashboard/courses">Cancel</Link>
							</Button>
							<Button
								className="flex-1"
								disabled={
									rating === 0 ||
									comment.length < 50 ||
									createReview.isPending
								}
								type="submit"
							>
								{createReview.isPending ? "Submitting..." : "Submit Review"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</form>
		</div>
	);
};

export default ReviewForm;
```

- [ ] **Step 3: Typecheck + lint + commit**

Run: `pnpm typecheck`
Expected: PASS.

```bash
pnpm check:write "app/dashboard/courses/[courseId]/review/components/ReviewForm"
git add "app/dashboard/courses/[courseId]/review/components/ReviewForm"
git commit -m "feat(review): add review form with create mutation"
```

---

### Task 8: Rewrite the review page as a server component

**Files:**
- Modify (full rewrite): `app/dashboard/courses/[courseId]/review/page.tsx`

**Interfaces:**
- Consumes: `api` from `@/trpc/server`; `redirect` from `next/navigation`; `ReviewForm`, `ReviewReadOnly`.
- Produces: the routed page that gates render by eligibility state (FR1–FR4).

- [ ] **Step 1: Replace the page**

Overwrite `app/dashboard/courses/[courseId]/review/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { api } from "@/trpc/server";
import ReviewForm from "./components/ReviewForm";
import ReviewReadOnly from "./components/ReviewReadOnly";

const ReviewCoursePage = async ({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) => {
	const { courseId } = await params;
	const eligibility = await api.review.getEligibility({ courseId });

	if (eligibility.state === "ineligible") {
		redirect(`/dashboard/browse/${courseId}`);
	}

	if (eligibility.state === "alreadyReviewed") {
		return (
			<ReviewReadOnly
				course={eligibility.course}
				review={eligibility.review}
			/>
		);
	}

	return <ReviewForm course={eligibility.course} />;
};

export default ReviewCoursePage;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Verify the build compiles the route**

Run: `pnpm build`
Expected: build succeeds; `/dashboard/courses/[courseId]/review` appears in the route list with no type errors.

- [ ] **Step 4: Lint + commit**

```bash
pnpm check:write "app/dashboard/courses/[courseId]/review/page.tsx"
git add "app/dashboard/courses/[courseId]/review/page.tsx"
git commit -m "feat(review): wire review page to eligibility, redirect/read-only/form"
```

---

### Task 9: Real average rating on browse cards

**Files:**
- Modify: `server/repositories/course.repository.ts` (`getPublishedCourses`, ~lines 253-300)
- Modify: `app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/index.tsx`
- Modify: `server/repositories/course.repository.integration.test.ts` (create if it does not exist)

**Interfaces:**
- Consumes: `courseReviewRepository.getAvgRatingByCourseIds(ids: string[]): Promise<Map<string, number | null>>` (already exists).
- Produces: `getPublishedCourses` returns `rating: number | null` per course (null = no reviews). `PublishedCourse.rating` becomes `number | null` (inferred automatically from the return type).

- [ ] **Step 1: Write the failing integration test**

Add to `server/repositories/course.repository.integration.test.ts` (create the file with this content if missing):

```ts
import { describe, expect, it } from "vitest";
import { CourseStatus, Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { courseRepository } from "./course.repository";

describe("CourseRepository.getPublishedCourses ratings", () => {
	it("returns the average rating for courses with reviews and null otherwise", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const rated = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const unrated = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: s1.id, rating: 4, comment: "ok" },
		});
		await testDb.courseReview.create({
			data: { courseId: rated.id, studentId: s2.id, rating: 2, comment: "ok" },
		});

		const { courses } = await courseRepository.getPublishedCourses({});
		const byId = new Map(courses.map((c) => [c.id, c.rating]));

		expect(byId.get(rated.id)).toBe(3);
		expect(byId.get(unrated.id)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: FAIL — `rated` rating is `4.8` (hardcoded), not `3`; `unrated` is `4.8`, not `null`.

- [ ] **Step 3: Use the real average in `getPublishedCourses`**

In `server/repositories/course.repository.ts`, replace the `return` block of `getPublishedCourses` so it batches the averages. After the `Promise.all([...])` that yields `[courses, total]`, change the mapping:

```ts
		const ratings = await this.courseReviewRepository.getAvgRatingByCourseIds(
			courses.map((course) => course.id),
		);

		return {
			courses: courses.map((course) => {
				const avg = ratings.get(course.id);
				return {
					id: course.id,
					title: course.title,
					instructor: course.instructor.name,
					rating: avg == null ? null : Number(avg.toFixed(1)),
					students: course._count.enrollments,
					duration: course.duration,
					priceCents: course.priceCents,
					level: course.level,
					thumbnail: course.thumbnailUrl,
					category: course.category,
				};
			}),
			total,
		};
```

(`this.courseReviewRepository` is already a member of `CourseRepository` — it is used in `getInstructorStats`. If it is not, add `private courseReviewRepository = courseReviewRepository;` with the matching import at the top.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration server/repositories/course.repository.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Handle the null case in the card**

In `app/_components/Course/components/BrowseCourses/components/BrowseCourseCard/index.tsx`, replace the rating block:

```tsx
						<div className="flex items-center gap-1">
							<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
							<span className="font-medium">{course.rating}</span>
						</div>
```

with a null-safe version:

```tsx
						<div className="flex items-center gap-1">
							{course.rating === null ? (
								<span className="text-muted-foreground">No ratings yet</span>
							) : (
								<>
									<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
									<span className="font-medium">{course.rating}</span>
								</>
							)}
						</div>
```

- [ ] **Step 6: Typecheck the full project**

Run: `pnpm typecheck`
Expected: PASS — `PublishedCourse.rating` is now `number | null` and the card handles both.

- [ ] **Step 7: Lint + commit**

```bash
pnpm check:write server/repositories/course.repository.ts server/repositories/course.repository.integration.test.ts "app/_components/Course/components/BrowseCourses/components/BrowseCourseCard"
git add server/repositories/course.repository.ts server/repositories/course.repository.integration.test.ts "app/_components/Course/components/BrowseCourses/components/BrowseCourseCard"
git commit -m "feat(review): show real average rating on browse cards"
```

---

### Task 10: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit + integration suite**

Run: `pnpm test`
Expected: PASS — including the new `review.dto`, `review.service`, `courseReview` and `course` repository tests.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm check`
Expected: both PASS with no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: build succeeds with the review route present.

- [ ] **Step 4: Commit any formatting drift**

```bash
git add -A
git commit -m "chore(review): formatting and verification" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- FR1/FR2 (ineligible → redirect) — Task 8 (`redirect` on `"ineligible"`), backed by Task 4 eligibility logic + Task 4 tests.
- FR3 (eligible form with real course data) — Tasks 4, 7, 8.
- FR4 (already reviewed → read-only) — Tasks 4, 6, 8.
- FR5 (submit disabled until rating≥1 & comment≥50) — Task 7 (`disabled` guard).
- FR6 (create persists rating/comment/tags + success) — Tasks 4, 5, 7.
- FR7 (server rejects non-completed) — Task 4 (`FORBIDDEN`) + test.
- FR8 (server rejects duplicate) — Task 4 (`CONFLICT`) + test; DB `@@unique` from Task 1.
- FR9 (reject bad rating/comment/tag) — Task 2 (Zod) + tests; enforced at router in Task 5.
- FR10 (detail page reflects new review) — unchanged existing code; verified via Task 10 build (no code change needed; `getPublishedCourse` already reads rows).
- FR11 (browse card average rating + no-ratings state) — Task 9.

**Placeholder scan:** none — every code step contains complete code; every command lists expected output.

**Type consistency:** `findByStudentAndCourse`, `getEligibility`, `createReview`, `EligibilityResult`/`CourseSummary`/`ReviewView`, `getAvgRatingByCourseIds`, and `createReviewInput` are used with identical names/signatures across tasks. `rating: number | null` is consistent between Task 9's repository change and the card.

**Note on Task 1 (schema):** schema/migration tasks are not classic red-green TDD; the deliverable is verified by `pnpm generate` + `pnpm typecheck`, and exercised by the integration tests in Tasks 3 and 9.