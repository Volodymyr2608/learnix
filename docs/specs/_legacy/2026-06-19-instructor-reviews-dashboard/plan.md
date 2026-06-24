# Instructor Reviews Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`requirements.md`](./requirements.md) for FRs,
> [`spec.md`](./spec.md) for design, [`validation.md`](./validation.md) for checks.

**Goal:** Replace the mock `/instructor/reviews` page with the instructor's real course reviews —
server-computed stats + distribution, a course filter that rescopes stats, a rating filter that
scopes the list, and a paginated list — with no reply feature.

**Architecture:** Mirror the Students feature: three `instructorProcedure` queries
(`getReviewCourseOptions`, `getReviewStats`, `getReviews`) → `InstructorService` methods →
new `CourseReviewRepository` methods (Prisma `groupBy`/`findMany`, instructor-ownership `where`).
The RSC page parses URL search params and `Promise.all`s three request helpers; the mock client
component is replaced by focused sub-components.

**Tech Stack:** Next.js 16 App Router (RSC), tRPC, Prisma, Zod, Vitest, Tailwind + shared Radix UI
primitives, `date-fns`.

**Codebase anchors (verified during planning):**
- `CourseReviewRepository` (`server/repositories/courseReview.repository.ts:4-99`) — extends
  `BaseRepository`; exposes `this.model` (for `groupBy`/`count`), `this.findMany`, `this.aggregate`.
  Instructor-ownership `where` already used: `{ deletedAt: null, course: { is: { instructorId, deletedAt: null } } }` (`:21-23`, `:69-71`).
- `InstructorService.getStudents` (`server/services/instructor/instructor.service.ts:195`) and
  `getDashboardStats` (`:90`) — the service shape to mirror (logger.info, `Promise.all`, DTO mapping).
- `getStudentsInput`/`PaginatedStudents` (`server/entities/instructor/students.ts`) — Zod input +
  paginated DTO pattern to mirror.
- `instructorRouter` (`server/api/routers/instructor.ts`) — `instructorProcedure` + `try/catch` +
  `handleServiceError` pattern.
- `getStudents` request helper (`lib/requests/instructor/getStudents.ts`) — try/catch + fallback,
  calls `api.instructor.*` from `@/trpc/server`.
- Students UI (`app/_components/Instructor/Students/`) — `searchParams.ts`, `hooks/useStudentsUrl.ts`,
  `StudentsFilters`, `StudentsResults`, colocated `types.ts` — the exact UI pattern to mirror.
- `PageShell` (`app/_components/_shared/components/PageShell`) — renders the `<h1>`; pages must NOT
  render their own heading.
- Shared UI primitives in `app/_components/_shared/ui/`: `card`, `badge`, `progress`, `avatar`,
  `select`, `tabs`, `button` (NOT the mock's `@/components/ui/*`).
- Integration test pattern: `server/repositories/courseReview.repository.integration.test.ts`.

**Per-task conventions:** After each impl step, `pnpm typecheck` + `pnpm check` must be clean
before committing. Unit tests are colocated `*.test.ts` (no DB); repository tests are
`*.integration.test.ts` (real `learnix_test`). Services and repositories export singletons. Run
integration tests with `pnpm test:integration <path>`, unit with `pnpm test:unit <path>`.

---

## Task 1: Reviews entity (DTOs + Zod inputs)

**Files:**
- Create: `server/entities/instructor/reviews.ts`

- [ ] **Step 1: Implement**

```ts
import { z } from "zod";
import type { ReviewTag } from "@/generated/prisma";

export const REVIEWS_PER_PAGE = 10;

export const getReviewStatsInput = z.object({
	courseId: z.string().cuid().optional(),
});
export type GetReviewStatsInput = z.infer<typeof getReviewStatsInput>;

export const getReviewsInput = z.object({
	courseId: z.string().cuid().optional(),
	rating: z.number().int().min(1).max(5).optional(),
	page: z.number().int().min(1).default(1),
});
export type GetReviewsInput = z.infer<typeof getReviewsInput>;

export type ReviewCourseOption = { id: string; title: string };

export type RatingDistributionBucket = {
	star: number; // 5..1
	count: number;
	percent: number; // 0..100
};

export type ReviewStats = {
	average: number | null; // null when total === 0
	total: number;
	fiveStarPercent: number; // 0..100
	lowRatingCount: number; // rating <= 2
	distribution: RatingDistributionBucket[]; // 5 buckets, star 5..1
};

export type ReviewRow = {
	id: string;
	studentName: string;
	studentImage: string | null;
	courseTitle: string;
	rating: number;
	comment: string;
	tags: ReviewTag[];
	createdAt: Date;
};

export type PaginatedReviews = {
	data: ReviewRow[];
	total: number;
	currentPage: number;
	perPage: number;
	lastPage: number;
};

export type ReviewsQueryState = {
	courseId: string; // "all" | cuid
	rating: string; // "all" | "1".."5"
	page: number;
};
```

- [ ] **Step 2: Verify** — `pnpm typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): add instructor reviews entity DTOs"`

---

## Task 2: Repository — `getInstructorReviewStats`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing integration suite; reuse its
  seed helpers for instructor/course/student/review)

```ts
describe("getInstructorReviewStats", () => {
	it("aggregates rating, total, five-star and low-rating counts per instructor", async () => {
		const { instructorId, courseId } = await seedInstructorWithCourse();
		await seedReview({ courseId, rating: 5 });
		await seedReview({ courseId, rating: 5 });
		await seedReview({ courseId, rating: 2 });
		await seedReview({ courseId, rating: 1 });

		const s = await courseReviewRepository.getInstructorReviewStats(instructorId);

		expect(s.total).toBe(4);
		expect(s.average).toBeCloseTo((5 + 5 + 2 + 1) / 4);
		expect(s.fiveStarCount).toBe(2);
		expect(s.lowRatingCount).toBe(2); // ratings 1 and 2
		expect(s.perStar.get(5)).toBe(2);
	});

	it("scopes to a single course when courseId is given and ignores other instructors", async () => {
		const { instructorId, courseId } = await seedInstructorWithCourse();
		const other = await seedInstructorWithCourse();
		await seedReview({ courseId, rating: 4 });
		await seedReview({ courseId: other.courseId, rating: 1 });
		const second = await seedCourse(instructorId);
		await seedReview({ courseId: second.courseId, rating: 1 });

		const scoped = await courseReviewRepository.getInstructorReviewStats(instructorId, courseId);
		expect(scoped.total).toBe(1);
		expect(scoped.average).toBe(4);

		const all = await courseReviewRepository.getInstructorReviewStats(instructorId);
		expect(all.total).toBe(2); // both of this instructor's courses, not the other instructor's
	});
});
```

> Adapt `seedInstructorWithCourse`/`seedReview`/`seedCourse` to the helpers already in the file; if
> only inline seeding exists, follow that style.

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts` → FAIL ("getInstructorReviewStats is not a function").

- [ ] **Step 3: Implement** (add method to `CourseReviewRepository`)

```ts
async getInstructorReviewStats(
	instructorId: string,
	courseId?: string,
): Promise<{
	average: number | null;
	total: number;
	fiveStarCount: number;
	lowRatingCount: number;
	perStar: Map<number, number>;
}> {
	const grouped = await this.model.groupBy({
		by: ["rating"],
		where: {
			deletedAt: null,
			course: { is: { instructorId, deletedAt: null } },
			...(courseId ? { courseId } : {}),
		},
		_count: { _all: true },
	});

	const perStar = new Map<number, number>();
	let total = 0;
	let weighted = 0;
	for (const g of grouped as {
		rating: number;
		_count: { _all: number };
	}[]) {
		const count = g._count._all;
		perStar.set(g.rating, count);
		total += count;
		weighted += g.rating * count;
	}

	return {
		average: total > 0 ? weighted / total : null,
		total,
		fiveStarCount: perStar.get(5) ?? 0,
		lowRatingCount: (perStar.get(1) ?? 0) + (perStar.get(2) ?? 0),
		perStar,
	};
}
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews): courseReviewRepository.getInstructorReviewStats"`

---

## Task 3: Repository — `findInstructorReviews`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("findInstructorReviews", () => {
	it("returns newest-first, paginated, with student + course fields, filtered by course and rating", async () => {
		const { instructorId, courseId } = await seedInstructorWithCourse();
		await seedReview({ courseId, rating: 5, comment: "old", createdAt: new Date("2025-01-01") });
		await seedReview({ courseId, rating: 3, comment: "mid", createdAt: new Date("2025-02-01") });
		await seedReview({ courseId, rating: 5, comment: "new", createdAt: new Date("2025-03-01") });

		const all = await courseReviewRepository.findInstructorReviews({
			instructorId, page: 1, perPage: 10,
		});
		expect(all.total).toBe(3);
		expect(all.rows[0].comment).toBe("new"); // newest first
		expect(all.rows[0]).toMatchObject({ courseTitle: expect.any(String), studentName: expect.any(String) });

		const fiveStar = await courseReviewRepository.findInstructorReviews({
			instructorId, rating: 5, page: 1, perPage: 10,
		});
		expect(fiveStar.total).toBe(2);
		expect(fiveStar.rows.every((r) => r.rating === 5)).toBe(true);

		const pageTwo = await courseReviewRepository.findInstructorReviews({
			instructorId, page: 2, perPage: 2,
		});
		expect(pageTwo.rows).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — method missing.

- [ ] **Step 3: Implement** (add `import type { ReviewRow } from "@/server/entities/instructor/reviews";` to the top of the repository file, then add the method)

```ts
async findInstructorReviews(params: {
	instructorId: string;
	courseId?: string;
	rating?: number;
	page: number;
	perPage: number;
}): Promise<{ rows: ReviewRow[]; total: number }> {
	const { instructorId, courseId, rating, page, perPage } = params;
	const where: Prisma.CourseReviewWhereInput = {
		deletedAt: null,
		course: { is: { instructorId, deletedAt: null } },
		...(courseId ? { courseId } : {}),
		...(rating ? { rating } : {}),
	};

	const [rows, total] = await Promise.all([
		this.findMany({
			where,
			orderBy: { createdAt: "desc" },
			skip: (page - 1) * perPage,
			take: perPage,
			select: {
				id: true,
				rating: true,
				comment: true,
				tags: true,
				createdAt: true,
				student: { select: { name: true, image: true } },
				course: { select: { title: true } },
			},
		}),
		this.model.count({ where }),
	]);

	return {
		rows: rows.map((r) => ({
			id: r.id,
			studentName: r.student.name,
			studentImage: r.student.image,
			courseTitle: r.course.title,
			rating: r.rating,
			comment: r.comment,
			tags: r.tags,
			createdAt: r.createdAt,
		})),
		total,
	};
}
```

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews): courseReviewRepository.findInstructorReviews"`

---

## Task 4: Repository — `getInstructorReviewCourseOptions`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("getInstructorReviewCourseOptions", () => {
	it("returns one entry per owned course that has at least one review", async () => {
		const { instructorId, courseId } = await seedInstructorWithCourse();
		await seedReview({ courseId, rating: 5 });
		await seedReview({ courseId, rating: 4 }); // same course → still one option
		await seedCourse(instructorId); // course with no reviews → excluded

		const options = await courseReviewRepository.getInstructorReviewCourseOptions(instructorId);
		expect(options).toHaveLength(1);
		expect(options[0]).toMatchObject({ id: courseId, title: expect.any(String) });
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — method missing.

- [ ] **Step 3: Implement**

```ts
async getInstructorReviewCourseOptions(
	instructorId: string,
): Promise<{ id: string; title: string }[]> {
	const rows = await this.findMany({
		where: {
			deletedAt: null,
			course: { is: { instructorId, deletedAt: null } },
		},
		distinct: ["courseId"],
		orderBy: { courseId: "asc" }, // DISTINCT ON requires the distinct column ordered first
		select: { course: { select: { id: true, title: true } } },
	});
	return rows.map((r) => ({ id: r.course.id, title: r.course.title }));
}
```

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews): courseReviewRepository.getInstructorReviewCourseOptions"`

---

## Task 5: Service — `getReviewStats`, `getReviews`, `getReviewCourseOptions`

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`
- Test: `server/services/instructor/instructor.service.test.ts`

- [ ] **Step 1: Write the failing test** (mock `courseReviewRepository`, mirroring the existing
  unit test's mocking style)

```ts
describe("getReviewStats", () => {
	it("shapes distribution (5..1) and rounds fiveStarPercent", async () => {
		vi.spyOn(courseReviewRepository, "getInstructorReviewStats").mockResolvedValue({
			average: 4.25,
			total: 4,
			fiveStarCount: 2,
			lowRatingCount: 1,
			perStar: new Map([[5, 2], [4, 1], [2, 1]]),
		});

		const stats = await instructorService.getReviewStats("inst-1", {});

		expect(stats.average).toBe(4.25);
		expect(stats.total).toBe(4);
		expect(stats.fiveStarPercent).toBe(50); // round(2/4*100)
		expect(stats.lowRatingCount).toBe(1);
		expect(stats.distribution.map((d) => d.star)).toEqual([5, 4, 3, 2, 1]);
		const five = stats.distribution[0];
		expect(five).toMatchObject({ star: 5, count: 2, percent: 50 });
		expect(stats.distribution[4]).toMatchObject({ star: 1, count: 0, percent: 0 });
	});

	it("returns null average and zeroed fields with no reviews", async () => {
		vi.spyOn(courseReviewRepository, "getInstructorReviewStats").mockResolvedValue({
			average: null, total: 0, fiveStarCount: 0, lowRatingCount: 0, perStar: new Map(),
		});
		const stats = await instructorService.getReviewStats("inst-1", {});
		expect(stats.average).toBeNull();
		expect(stats.fiveStarPercent).toBe(0);
		expect(stats.distribution.every((d) => d.count === 0 && d.percent === 0)).toBe(true);
	});
});

describe("getReviews", () => {
	it("wraps repository rows in pagination metadata", async () => {
		vi.spyOn(courseReviewRepository, "findInstructorReviews").mockResolvedValue({
			rows: [], total: 23,
		});
		const result = await instructorService.getReviews("inst-1", { page: 2 });
		expect(result).toMatchObject({ total: 23, currentPage: 2, perPage: 10, lastPage: 3 });
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test:unit server/services/instructor/instructor.service.test.ts` → methods missing.

- [ ] **Step 3: Implement** (add imports + methods)

```ts
// add to the existing entity import group
import type {
	GetReviewsInput,
	GetReviewStatsInput,
	PaginatedReviews,
	RatingDistributionBucket,
	ReviewCourseOption,
	ReviewStats,
} from "@/server/entities/instructor/reviews";
import { REVIEWS_PER_PAGE } from "@/server/entities/instructor/reviews";
```

```ts
async getReviewCourseOptions(
	instructorId: string,
): Promise<ReviewCourseOption[]> {
	logger.info("Getting instructor review course options", { instructorId });
	const options =
		await courseReviewRepository.getInstructorReviewCourseOptions(instructorId);
	return options.sort((a, b) => a.title.localeCompare(b.title));
}

async getReviewStats(
	instructorId: string,
	input: GetReviewStatsInput,
): Promise<ReviewStats> {
	logger.info("Getting instructor review stats", { instructorId, ...input });
	const s = await courseReviewRepository.getInstructorReviewStats(
		instructorId,
		input.courseId,
	);
	const distribution: RatingDistributionBucket[] = [5, 4, 3, 2, 1].map(
		(star) => {
			const count = s.perStar.get(star) ?? 0;
			return {
				star,
				count,
				percent: s.total > 0 ? (count / s.total) * 100 : 0,
			};
		},
	);
	return {
		average: s.average,
		total: s.total,
		fiveStarPercent:
			s.total > 0 ? Math.round((s.fiveStarCount / s.total) * 100) : 0,
		lowRatingCount: s.lowRatingCount,
		distribution,
	};
}

async getReviews(
	instructorId: string,
	input: GetReviewsInput,
): Promise<PaginatedReviews> {
	logger.info("Getting instructor reviews", { instructorId, ...input });
	const { rows, total } = await courseReviewRepository.findInstructorReviews({
		instructorId,
		courseId: input.courseId,
		rating: input.rating,
		page: input.page,
		perPage: REVIEWS_PER_PAGE,
	});
	return {
		data: rows,
		total,
		currentPage: input.page,
		perPage: REVIEWS_PER_PAGE,
		lastPage: Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE)),
	};
}
```

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews): instructor service review stats/list/options"`

---

## Task 6: Router — three `instructorProcedure` queries

**Files:**
- Modify: `server/api/routers/instructor.ts`

- [ ] **Step 1: Implement** (add imports + procedures inside `createTRPCRouter({ ... })`)

```ts
import {
	getReviewsInput,
	getReviewStatsInput,
} from "@/server/entities/instructor/reviews";
```

```ts
	getReviewCourseOptions: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getReviewCourseOptions(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	getReviewStats: instructorProcedure
		.input(getReviewStatsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getReviewStats(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),

	getReviews: instructorProcedure
		.input(getReviewsInput)
		.query(async ({ ctx, input }) => {
			try {
				return await instructorService.getReviews(ctx.session.user.id, input);
			} catch (error) {
				handleServiceError(error);
			}
		}),
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): instructor router review queries"`

---

## Task 7: Request helpers (RSC data fetchers)

**Files:**
- Create: `lib/requests/instructor/getReviewCourseOptions.ts`
- Create: `lib/requests/instructor/getReviewStats.ts`
- Create: `lib/requests/instructor/getReviews.ts`

- [ ] **Step 1: Implement**

```ts
// getReviewCourseOptions.ts
import type { ReviewCourseOption } from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const getReviewCourseOptions = async (): Promise<ReviewCourseOption[]> => {
	try {
		return (await api.instructor.getReviewCourseOptions()) ?? [];
	} catch (error) {
		console.error("Error fetching review course options:", error);
		return [];
	}
};

export default getReviewCourseOptions;
```

```ts
// getReviewStats.ts
import type {
	GetReviewStatsInput,
	ReviewStats,
} from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const empty: ReviewStats = {
	average: null,
	total: 0,
	fiveStarPercent: 0,
	lowRatingCount: 0,
	distribution: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0, percent: 0 })),
};

const getReviewStats = async (
	input: GetReviewStatsInput,
): Promise<ReviewStats> => {
	try {
		return (await api.instructor.getReviewStats(input)) ?? empty;
	} catch (error) {
		console.error("Error fetching review stats:", error);
		return empty;
	}
};

export default getReviewStats;
```

```ts
// getReviews.ts
import type {
	GetReviewsInput,
	PaginatedReviews,
} from "@/server/entities/instructor/reviews";
import { api } from "@/trpc/server";

const empty = (page: number): PaginatedReviews => ({
	data: [],
	total: 0,
	currentPage: page,
	perPage: 0,
	lastPage: 1,
});

const getReviews = async (
	input: GetReviewsInput,
): Promise<PaginatedReviews> => {
	try {
		return (await api.instructor.getReviews(input)) ?? empty(input.page);
	} catch (error) {
		console.error("Error fetching instructor reviews:", error);
		return empty(input.page);
	}
};

export default getReviews;
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): RSC request helpers"`

---

## Task 8: URL state — `searchParams.ts`, `useReviewsUrl`, `types.ts`

**Files:**
- Create: `app/_components/Instructor/Reviews/searchParams.ts`
- Create: `app/_components/Instructor/Reviews/hooks/useReviewsUrl.ts`
- Create: `app/_components/Instructor/Reviews/types.ts`
- Test: `app/_components/Instructor/Reviews/searchParams.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
	parseReviewsSearchParams,
	toReviewsInput,
	toStatsInput,
} from "./searchParams";

describe("parseReviewsSearchParams", () => {
	it("defaults to all/all/page 1", () => {
		expect(parseReviewsSearchParams({})).toEqual({ courseId: "all", rating: "all", page: 1 });
	});
	it("rejects out-of-range rating and bad page", () => {
		expect(parseReviewsSearchParams({ rating: "9", page: "0" })).toMatchObject({ rating: "all", page: 1 });
	});
	it("keeps valid values", () => {
		expect(parseReviewsSearchParams({ courseId: "c1", rating: "4", page: "3" })).toEqual({
			courseId: "c1", rating: "4", page: 3,
		});
	});
});

describe("toStatsInput / toReviewsInput", () => {
	it("stats input carries courseId only, dropping 'all'", () => {
		expect(toStatsInput({ courseId: "all", rating: "5", page: 2 })).toEqual({});
		expect(toStatsInput({ courseId: "c1", rating: "5", page: 2 })).toEqual({ courseId: "c1" });
	});
	it("reviews input maps rating to number and drops 'all'", () => {
		expect(toReviewsInput({ courseId: "all", rating: "all", page: 1 })).toEqual({ page: 1 });
		expect(toReviewsInput({ courseId: "c1", rating: "4", page: 2 })).toEqual({
			courseId: "c1", rating: 4, page: 2,
		});
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test:unit app/_components/Instructor/Reviews/searchParams.test.ts`.

- [ ] **Step 3: Implement**

```ts
// types.ts
import type {
	PaginatedReviews,
	ReviewCourseOption,
	ReviewRow,
	ReviewsQueryState,
	ReviewStats,
} from "@/server/entities/instructor/reviews";

export type { ReviewsQueryState };

export type ReviewsStatsProps = { stats: ReviewStats };
export type StatCardProps = { label: string; value: string; tint: string; icon: React.ReactNode };
export type ReviewsFiltersProps = { courses: ReviewCourseOption[]; query: ReviewsQueryState };
export type ReviewsResultsProps = { reviews: PaginatedReviews; query: ReviewsQueryState };
export type ReviewCardProps = { review: ReviewRow };
export type StarsProps = { rating: number; className?: string };
```

```ts
// searchParams.ts
import type {
	GetReviewsInput,
	GetReviewStatsInput,
	ReviewsQueryState,
} from "@/server/entities/instructor/reviews";

type RawSearchParams = Record<string, string | string[] | undefined>;
const RATINGS = ["1", "2", "3", "4", "5"] as const;

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
function asRating(value: string | undefined): string {
	return RATINGS.includes(value as (typeof RATINGS)[number]) ? (value as string) : "all";
}
function asPage(value: string | undefined): number {
	const page = Number.parseInt(value ?? "", 10);
	return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function parseReviewsSearchParams(sp: RawSearchParams): ReviewsQueryState {
	return {
		courseId: first(sp.courseId) ?? "all",
		rating: asRating(first(sp.rating)),
		page: asPage(first(sp.page)),
	};
}

export function toStatsInput(query: ReviewsQueryState): GetReviewStatsInput {
	return { courseId: query.courseId === "all" ? undefined : query.courseId };
}

export function toReviewsInput(query: ReviewsQueryState): GetReviewsInput {
	return {
		courseId: query.courseId === "all" ? undefined : query.courseId,
		rating: query.rating === "all" ? undefined : Number(query.rating),
		page: query.page,
	};
}
```

```ts
// hooks/useReviewsUrl.ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { ReviewsQueryState } from "../types";

type ReviewsUrlUpdate = Partial<Pick<ReviewsQueryState, "courseId" | "rating" | "page">>;

const FILTER_KEYS = ["courseId", "rating"] as const;
const DEFAULTS: Record<string, string> = { courseId: "all", rating: "all", page: "1" };

function isDefault(key: string, value: string): boolean {
	return DEFAULTS[key] === value;
}

export function useReviewsUrl() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const update = useCallback(
		(updates: ReviewsUrlUpdate) => {
			const params = new URLSearchParams(searchParams.toString());
			const changedFilter = FILTER_KEYS.some((key) => key in updates);
			if (changedFilter && updates.page === undefined) params.delete("page");

			for (const [key, value] of Object.entries(updates)) {
				const str = String(value);
				if (value === undefined || isDefault(key, str)) params.delete(key);
				else params.set(key, str);
			}

			const qs = params.toString();
			startTransition(() => {
				router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
			});
		},
		[router, pathname, searchParams],
	);

	return { update, isPending };
}
```

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews): URL search-param state + hook"`

---

## Task 9: `Stars` + `ReviewCard` components

**Files:**
- Create: `app/_components/Instructor/Reviews/Stars/index.tsx`
- Create: `app/_components/Instructor/Reviews/ReviewCard/index.tsx`

- [ ] **Step 1: Implement**

```tsx
// Stars/index.tsx
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StarsProps } from "../types";

export function Stars({ rating, className }: StarsProps) {
	return (
		<div aria-label={`${rating} out of 5`} className={cn("flex items-center gap-0.5", className)}>
			{[1, 2, 3, 4, 5].map((i) => (
				<Star
					aria-hidden
					className={cn(
						"h-4 w-4",
						i <= rating ? "fill-yellow-400 text-yellow-400" : "fill-muted text-muted",
					)}
					key={i}
				/>
			))}
		</div>
	);
}
```

```tsx
// ReviewCard/index.tsx
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import { Stars } from "../Stars";
import type { ReviewCardProps } from "../types";

function initials(name: string): string {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function formatTag(tag: string): string {
	return tag.toLowerCase().split("_").join(" ");
}

export function ReviewCard({ review }: ReviewCardProps) {
	return (
		<Card className="p-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex gap-4">
					<Avatar>
						<AvatarFallback className="bg-muted font-medium text-sm">
							{initials(review.studentName)}
						</AvatarFallback>
					</Avatar>
					<div>
						<p className="font-semibold">{review.studentName}</p>
						<p className="text-muted-foreground text-sm">{review.courseTitle}</p>
						<div className="mt-2 flex items-center gap-2">
							<Stars rating={review.rating} />
							<span className="text-muted-foreground text-sm">
								{format(review.createdAt, "MMM d, yyyy")}
							</span>
						</div>
					</div>
				</div>
			</div>

			<p className="mt-4 text-muted-foreground text-sm leading-relaxed">{review.comment}</p>

			{review.tags.length > 0 && (
				<div className="mt-4 flex flex-wrap gap-2">
					{review.tags.map((tag) => (
						<Badge className="capitalize" key={tag} variant="secondary">
							{formatTag(tag)}
						</Badge>
					))}
				</div>
			)}
		</Card>
	);
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): Stars and ReviewCard components"`

---

## Task 10: `ReviewsStats` (cards + distribution)

**Files:**
- Create: `app/_components/Instructor/Reviews/ReviewsStats/index.tsx`

- [ ] **Step 1: Implement**

```tsx
import { MessageSquare, Star, ThumbsDown, TrendingUp } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import { cn } from "@/lib/utils";
import { Stars } from "../Stars";
import type { ReviewsStatsProps, StatCardProps } from "../types";

function StatCard({ label, value, tint, icon }: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
				</div>
				<div className={cn("flex h-12 w-12 items-center justify-center rounded-full", tint)}>
					{icon}
				</div>
			</div>
		</Card>
	);
}

export function ReviewsStats({ stats }: ReviewsStatsProps) {
	const average = stats.average ?? 0;
	return (
		<>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				<StatCard
					icon={<Star className="h-6 w-6" />}
					label="Average Rating"
					tint="bg-yellow-500/10 text-yellow-600"
					value={average.toFixed(1)}
				/>
				<StatCard
					icon={<MessageSquare className="h-6 w-6" />}
					label="Total Reviews"
					tint="bg-blue-500/10 text-blue-600"
					value={stats.total.toString()}
				/>
				<StatCard
					icon={<TrendingUp className="h-6 w-6" />}
					label="5-Star Reviews"
					tint="bg-green-500/10 text-green-600"
					value={`${stats.fiveStarPercent}%`}
				/>
				<StatCard
					icon={<ThumbsDown className="h-6 w-6" />}
					label="Low Ratings (≤2★)"
					tint="bg-red-500/10 text-red-600"
					value={stats.lowRatingCount.toString()}
				/>
			</div>

			<Card className="grid gap-8 p-6 md:grid-cols-3">
				<div className="flex flex-col items-center justify-center text-center">
					<p className="font-bold text-5xl">{average.toFixed(1)}</p>
					<Stars className="mt-2" rating={Math.round(average)} />
					<p className="mt-2 text-muted-foreground text-sm">
						Based on {stats.total} reviews
					</p>
				</div>
				<div className="space-y-2 md:col-span-2">
					{stats.distribution.map((d) => (
						<div className="flex items-center gap-3" key={d.star}>
							<span className="flex w-12 items-center gap-1 text-muted-foreground text-sm">
								{d.star}
								<Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
							</span>
							<Progress className="h-2 flex-1" value={d.percent} />
							<span className="w-8 text-right text-muted-foreground text-sm">{d.count}</span>
						</div>
					))}
				</div>
			</Card>
		</>
	);
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): ReviewsStats cards and distribution"`

---

## Task 11: `ReviewsFilters` (course Select)

**Files:**
- Create: `app/_components/Instructor/Reviews/ReviewsFilters/index.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { useReviewsUrl } from "../hooks/useReviewsUrl";
import type { ReviewsFiltersProps } from "../types";

export function ReviewsFilters({ courses, query }: ReviewsFiltersProps) {
	const { update } = useReviewsUrl();
	return (
		<Select onValueChange={(courseId) => update({ courseId })} value={query.courseId}>
			<SelectTrigger className="w-full sm:w-64">
				<SelectValue placeholder="All courses" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">All courses</SelectItem>
				{courses.map((c) => (
					<SelectItem key={c.id} value={c.id}>
						{c.title}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): ReviewsFilters course select"`

---

## Task 12: `ReviewsResults` (rating tabs + list + pagination)

**Files:**
- Create: `app/_components/Instructor/Reviews/ReviewsResults/index.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/_components/_shared/ui/tabs";
import { ReviewCard } from "../ReviewCard";
import { useReviewsUrl } from "../hooks/useReviewsUrl";
import type { ReviewsResultsProps } from "../types";

const RATING_TABS = ["all", "5", "4", "3", "2", "1"] as const;

export function ReviewsResults({ reviews, query }: ReviewsResultsProps) {
	const { update, isPending } = useReviewsUrl();

	return (
		<div className="space-y-4">
			<Tabs onValueChange={(rating) => update({ rating })} value={query.rating}>
				<TabsList>
					{RATING_TABS.map((t) => (
						<TabsTrigger key={t} value={t}>
							{t === "all" ? "All" : `${t} star`}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{reviews.data.length === 0 && (
				<Card className="p-12 text-center text-muted-foreground">
					No reviews match your filters.
				</Card>
			)}

			{reviews.data.map((review) => (
				<ReviewCard key={review.id} review={review} />
			))}

			{reviews.lastPage > 1 && (
				<div className="flex items-center justify-between pt-2">
					<Button
						disabled={isPending || query.page <= 1}
						onClick={() => update({ page: query.page - 1 })}
						size="sm"
						variant="outline"
					>
						Previous
					</Button>
					<span className="text-muted-foreground text-sm">
						Page {reviews.currentPage} of {reviews.lastPage}
					</span>
					<Button
						disabled={isPending || query.page >= reviews.lastPage}
						onClick={() => update({ page: query.page + 1 })}
						size="sm"
						variant="outline"
					>
						Next
					</Button>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews): ReviewsResults tabs, list, pagination"`

---

## Task 13: Page wiring + delete the mock

**Files:**
- Modify: `app/instructor/reviews/page.tsx`
- Delete: `app/_components/Instructor/Reviews/index.tsx`

- [ ] **Step 1: Implement the RSC page**

```tsx
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { ReviewsFilters } from "@/app/_components/Instructor/Reviews/ReviewsFilters";
import { ReviewsResults } from "@/app/_components/Instructor/Reviews/ReviewsResults";
import { ReviewsStats } from "@/app/_components/Instructor/Reviews/ReviewsStats";
import {
	parseReviewsSearchParams,
	toReviewsInput,
	toStatsInput,
} from "@/app/_components/Instructor/Reviews/searchParams";
import getReviewCourseOptions from "@/lib/requests/instructor/getReviewCourseOptions";
import getReviews from "@/lib/requests/instructor/getReviews";
import getReviewStats from "@/lib/requests/instructor/getReviewStats";

type InstructorReviewsPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorReviewsPage({
	searchParams,
}: InstructorReviewsPageProps) {
	const query = parseReviewsSearchParams(await searchParams);

	const [courses, stats, reviews] = await Promise.all([
		getReviewCourseOptions(),
		getReviewStats(toStatsInput(query)),
		getReviews(toReviewsInput(query)),
	]);

	return (
		<PageShell
			action={<ReviewsFilters courses={courses} query={query} />}
			description="See what students think of your courses."
			title="Reviews"
		>
			<ReviewsStats stats={stats} />
			<ReviewsResults query={query} reviews={reviews} />
		</PageShell>
	);
}
```

- [ ] **Step 2: Delete the mock** — `git rm app/_components/Instructor/Reviews/index.tsx`

- [ ] **Step 3: Verify** — `pnpm typecheck` + `pnpm check` clean; `pnpm build` succeeds (no dangling
  import of the deleted `ReviewsOverview`). Manually load `/instructor/reviews` per validation.md.

- [ ] **Step 4: Commit** — `git commit -m "feat(reviews): wire instructor reviews page to real data"`

---

## Self-review (run before handoff)

- **Spec coverage:**
  - FR1 (avg) → Task 2, 5, 10 · FR2 (total) → 2, 5, 10 · FR3 (5-star %) → 5, 10 ·
    FR4 (low ratings) → 2, 5, 10 · FR5 (distribution) → 5, 10 · FR6 (summary) → 10.
  - FR7 (course filter rescopes) → 2/3 (`courseId` in both repo where), 8 (`toStatsInput`/`toReviewsInput`), 11, 13.
  - FR8 (rating filter, list only) → 3 (`rating` in list where only), 8, 12.
  - FR9 (combined) → 3, 8, 12. · FR10 (review card) → 9. · FR11 (tags) → 9.
  - FR12 (ordering + pagination) → 3, 5, 12. · FR13 (empty-filter) → 7 (fallback), 12. ·
    FR14 (no-reviews) → 2/5 (null/zero), 7, 10, 12. · FR15 (page header) → 13.
- **Placeholder scan:** no `TBD`/`TODO`; all code steps are complete.
- **Type consistency:** `ReviewStats`, `ReviewRow`, `PaginatedReviews`, `ReviewsQueryState`,
  `REVIEWS_PER_PAGE`, `getReviewStatsInput`, `getReviewsInput`, `perStar` map keys (number) are
  used identically across entity, repo, service, helpers, and components.

## Final verification (see [`validation.md`](./validation.md) for detail)

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `/instructor/reviews` shows real reviews; course Select rescopes stats + list; rating tabs filter
  the list while the distribution stays put; pagination works; a no-review instructor sees zeros +
  the empty state; no mock names anywhere in the DOM.