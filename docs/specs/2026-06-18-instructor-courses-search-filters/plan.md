# Instructor Courses — Search, Filters & Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side, URL-param-driven search, status/category filters, sorting, and pagination to the instructor "My Courses" page.

**Architecture:** Mirror the existing **Students** feature. A new `course.searchOwnCourses` tRPC procedure (`instructorProcedure`) runs one filtered/sorted/paginated Prisma query scoped to the signed-in instructor and returns a `PaginatedOwnCourses` result. The page parses `searchParams` with a tested parser, the server `OwnCourses` component fetches and renders the grid + reused `CoursePagination`, and a client filter bar pushes URL updates. The existing `course.getOwnCourses` procedure is left untouched (the Students page still consumes it).

**Tech Stack:** Next.js 16 App Router (RSC), tRPC, Prisma, Zod, Radix `Select`, Vitest.

## Global Constraints

- **Three-layer pattern:** router → `CourseService` → `courseRepository`. Query logic in the repository; service is a thin pass-through.
- **`types.ts` always:** every component folder has a colocated `types.ts`; no prop types inline in `index.tsx`.
- **No nested ternaries in JSX:** use sequential boolean guards / early returns.
- **Page size = 9.** Search matches `title`/`subtitle`/`description` only (case-insensitive `contains`, OR-combined). Sort options: `updated` (default), `newest`, `oldest`, `title`, `students`.
- **Scope is fixed:** every query is AND-scoped to `instructorId = ctx.session.user.id` and `deletedAt: null`; filters only narrow.
- **No `CourseCard` change.** No schema/migration/env change.
- **Biome** for lint/format (run `pnpm check:write` before each commit).

---

## File Structure

**New**
- `server/entities/course/ownCourses.ts` — `getOwnCoursesInput` zod schema + `OwnCourseRow` / `PaginatedOwnCourses` types.
- `server/entities/course/ownCourses.test.ts` — zod default/validation unit tests.
- `app/_components/Course/components/OwnCourses/types.ts` — `OwnCoursesQueryState`, `OwnCoursesProps`.
- `app/_components/Course/components/OwnCourses/searchParams.ts` — `parseOwnCoursesSearchParams` + `toSearchInput`.
- `app/_components/Course/components/OwnCourses/searchParams.test.ts` — parser unit tests.
- `app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.ts` — pure URL builder.
- `app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts` — URL builder unit tests.
- `app/_components/Course/components/OwnCourses/constants.ts` — `STATUS_OPTIONS`, `SORT_OPTIONS`, `CATEGORY_OPTIONS`.
- `app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl.ts` — client URL-update hook.
- `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/index.tsx` — client filter bar.
- `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/types.ts` — its prop type.
- `app/_components/Course/components/OwnCourses/actions/searchOwnCourses.ts` — server action wrapping the procedure (replaces `actions/getOwnCourses.ts`).

**Modified**
- `server/repositories/course.repository.ts` — add `searchOwnCourses`.
- `server/repositories/course.repository.integration.test.ts` — add `searchOwnCourses` tests.
- `server/services/course/course.service.ts` — add `searchOwnCourses`.
- `server/services/course/course.integration.test.ts` — add a service-level wiring test.
- `server/api/routers/course.ts` — add `searchOwnCourses` procedure.
- `app/instructor/courses/page.tsx` — async, parse `searchParams`, pass `query`.
- `app/_components/Course/components/OwnCourses/index.tsx` — async; render filter bar + grid/empty + pagination.
- `app/_components/Course/components/CourseCard/types.ts` — re-point the `OwnCourse` import.

**Deleted**
- `app/_components/Course/components/OwnCourses/actions/getOwnCourses.ts` — replaced by `searchOwnCourses.ts`.

---

### Task 1: Query entity & input schema

**Files:**
- Create: `server/entities/course/ownCourses.ts`
- Test: `server/entities/course/ownCourses.test.ts`

**Interfaces:**
- Produces: `getOwnCoursesInput` (zod schema), `GetOwnCoursesInput` (type), `OwnCourseRow`, `PaginatedOwnCourses`.

- [ ] **Step 1: Write the failing test**

```ts
// server/entities/course/ownCourses.test.ts
import { describe, expect, it } from "vitest";
import { getOwnCoursesInput } from "./ownCourses";

describe("getOwnCoursesInput", () => {
	it("applies defaults for an empty object", () => {
		expect(getOwnCoursesInput.parse({})).toEqual({
			status: "all",
			sort: "updated",
			page: 1,
		});
	});

	it("trims and caps q, and accepts valid enums", () => {
		const parsed = getOwnCoursesInput.parse({
			q: "  react  ",
			status: "draft",
			category: "development",
			sort: "students",
			page: 3,
		});
		expect(parsed).toEqual({
			q: "react",
			status: "draft",
			category: "development",
			sort: "students",
			page: 3,
		});
	});

	it("rejects an out-of-range page", () => {
		expect(() => getOwnCoursesInput.parse({ page: 0 })).toThrow();
	});

	it("rejects an unknown sort value", () => {
		expect(() => getOwnCoursesInput.parse({ sort: "bogus" })).toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project unit server/entities/course/ownCourses.test.ts`
Expected: FAIL — cannot resolve `./ownCourses`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/entities/course/ownCourses.ts
import { z } from "zod";
import type { CourseStatus } from "@/generated/prisma";

export const getOwnCoursesInput = z.object({
	q: z.string().trim().max(200).optional(),
	status: z.enum(["all", "draft", "published"]).default("all"),
	category: z.string().optional(),
	sort: z.enum(["updated", "newest", "oldest", "title", "students"]).default("updated"),
	page: z.number().int().min(1).default(1),
});

export type GetOwnCoursesInput = z.infer<typeof getOwnCoursesInput>;

export type OwnCourseRow = {
	id: string;
	title: string;
	status: CourseStatus;
	updatedAt: Date;
	thumbnailUrl: string | null;
};

export type PaginatedOwnCourses = {
	data: OwnCourseRow[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project unit server/entities/course/ownCourses.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/entities/course/ownCourses.ts server/entities/course/ownCourses.test.ts
git commit -m "feat(course): add getOwnCoursesInput schema and PaginatedOwnCourses types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Repository `searchOwnCourses`

**Files:**
- Modify: `server/repositories/course.repository.ts`
- Test: `server/repositories/course.repository.integration.test.ts`

**Interfaces:**
- Consumes: `GetOwnCoursesInput`, `PaginatedOwnCourses` from `server/entities/course/ownCourses.ts`.
- Produces: `courseRepository.searchOwnCourses(params: GetOwnCoursesInput & { instructorId: string }): Promise<PaginatedOwnCourses>`.

- [ ] **Step 1: Write the failing test** (append to the existing integration test file)

```ts
// append to server/repositories/course.repository.integration.test.ts
describe("CourseRepository.searchOwnCourses", () => {
	it("scopes to the instructor, excludes soft-deleted, and paginates", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		for (let i = 0; i < 10; i++) {
			await makeCourse({ instructorId: instructor.id, title: `Owned ${i}` });
		}
		await makeCourse({ instructorId: instructor.id, title: "Gone", deletedAt: new Date() });
		await makeCourse({ instructorId: other.id, title: "Foreign" });

		const page1 = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "updated",
			page: 1,
		});
		expect(page1.total).toBe(10);
		expect(page1.data).toHaveLength(9);
		expect(page1.lastPage).toBe(2);
		expect(page1.perPage).toBe(9);
		expect(page1.data.every((c) => c.title.startsWith("Owned"))).toBe(true);

		const page2 = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "updated",
			page: 2,
		});
		expect(page2.data).toHaveLength(1);
		expect(page2.currentPage).toBe(2);
	});

	it("filters by status", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, status: CourseStatus.draft });
		await makeCourse({ instructorId: instructor.id, status: CourseStatus.published });

		const drafts = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "draft",
			sort: "updated",
			page: 1,
		});
		expect(drafts.total).toBe(1);
		expect(drafts.data[0]?.status).toBe(CourseStatus.draft);
	});

	it("filters by category case-insensitively", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, category: "Development" });
		await makeCourse({ instructorId: instructor.id, category: "Design" });

		const dev = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			category: "development",
			sort: "updated",
			page: 1,
		});
		expect(dev.total).toBe(1);
	});

	it("searches title, subtitle, and description", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Intro to Rust" });
		await makeCourse({ instructorId: instructor.id, title: "Other", subtitle: "All about Rust internals" });
		await makeCourse({ instructorId: instructor.id, title: "Other 2", description: "covers rust deeply" });
		await makeCourse({ instructorId: instructor.id, title: "Python" });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			q: "rust",
			status: "all",
			sort: "updated",
			page: 1,
		});
		expect(res.total).toBe(3);
	});

	it("sorts by title A-Z", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Zebra" });
		await makeCourse({ instructorId: instructor.id, title: "Apple" });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "title",
			page: 1,
		});
		expect(res.data.map((c) => c.title)).toEqual(["Apple", "Zebra"]);
	});

	it("sorts by most students", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const few = await makeCourse({ instructorId: instructor.id, title: "Few" });
		const many = await makeCourse({ instructorId: instructor.id, title: "Many" });
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		await makeEnrollment({ studentId: s1.id, courseId: many.id });
		await makeEnrollment({ studentId: s2.id, courseId: many.id });
		await makeEnrollment({ studentId: s1.id, courseId: few.id });

		const res = await courseRepository.searchOwnCourses({
			instructorId: instructor.id,
			status: "all",
			sort: "students",
			page: 1,
		});
		expect(res.data[0]?.title).toBe("Many");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project integration server/repositories/course.repository.integration.test.ts -t searchOwnCourses`
Expected: FAIL — `searchOwnCourses is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `server/repositories/course.repository.ts` (alongside existing imports):

```ts
import type {
	GetOwnCoursesInput,
	PaginatedOwnCourses,
} from "@/server/entities/course/ownCourses";
```

Add this method to the `CourseRepository` class (next to `getOwnCourses`):

```ts
async searchOwnCourses(
	params: GetOwnCoursesInput & { instructorId: string },
): Promise<PaginatedOwnCourses> {
	const PAGE_SIZE = 9;
	const { instructorId, q, status = "all", category, sort = "updated", page = 1 } = params;

	const where: Prisma.CourseWhereInput = {
		instructorId,
		deletedAt: null,
		...(status !== "all" ? { status } : {}),
		...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
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

	const [data, total] = await Promise.all([
		this.findMany({
			where,
			select: {
				id: true,
				title: true,
				status: true,
				updatedAt: true,
				thumbnailUrl: true,
			},
			orderBy: ORDER_BY[sort],
			skip: (page - 1) * PAGE_SIZE,
			take: PAGE_SIZE,
		}),
		this.count(where),
	]);

	return {
		data,
		total,
		currentPage: page,
		lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
		perPage: PAGE_SIZE,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project integration server/repositories/course.repository.integration.test.ts -t searchOwnCourses`
Expected: PASS (6 tests). (Requires the `learnix_test` DB — see `.env.test.example`.)

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/repositories/course.repository.ts server/repositories/course.repository.integration.test.ts
git commit -m "feat(course): add CourseRepository.searchOwnCourses with filter/sort/pagination

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Service method & tRPC procedure

**Files:**
- Modify: `server/services/course/course.service.ts`
- Modify: `server/api/routers/course.ts`
- Test: `server/services/course/course.integration.test.ts`

**Interfaces:**
- Consumes: `courseRepository.searchOwnCourses`, `GetOwnCoursesInput`, `getOwnCoursesInput`.
- Produces: `courseService.searchOwnCourses(instructorId: string, input: GetOwnCoursesInput): Promise<PaginatedOwnCourses>`; tRPC `course.searchOwnCourses`.

- [ ] **Step 1: Write the failing test** (append to the existing service integration test)

```ts
// append to server/services/course/course.integration.test.ts
describe("CourseService.searchOwnCourses", () => {
	it("delegates to the repository and stays scoped to the instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id, title: "Mine" });
		await makeCourse({ instructorId: other.id, title: "Theirs" });

		const res = await courseService.searchOwnCourses(instructor.id, {
			status: "all",
			sort: "updated",
			page: 1,
		});

		expect(res.total).toBe(1);
		expect(res.data[0]?.title).toBe("Mine");
	});
});
```

> Verify the existing test file already imports `makeUser`, `makeCourse`, `Role`, and `courseService`. Add any that are missing to the existing import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project integration server/services/course/course.integration.test.ts -t searchOwnCourses`
Expected: FAIL — `courseService.searchOwnCourses is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `server/services/course/course.service.ts`, add the import:

```ts
import type {
	GetOwnCoursesInput,
	PaginatedOwnCourses,
} from "@/server/entities/course/ownCourses";
```

Add this method to the `CourseService` class:

```ts
async searchOwnCourses(
	instructorId: string,
	input: GetOwnCoursesInput,
): Promise<PaginatedOwnCourses> {
	return courseRepository.searchOwnCourses({ ...input, instructorId });
}
```

In `server/api/routers/course.ts`, add the entity import:

```ts
import { getOwnCoursesInput } from "@/server/entities/course/ownCourses";
```

Add this procedure to `courseRouter` (next to `getOwnCourses`):

```ts
searchOwnCourses: instructorProcedure
	.input(getOwnCoursesInput)
	.query(async ({ ctx, input }) => {
		try {
			return await courseService.searchOwnCourses(ctx.session.user.id, input);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project integration server/services/course/course.integration.test.ts -t searchOwnCourses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add server/services/course/course.service.ts server/api/routers/course.ts server/services/course/course.integration.test.ts
git commit -m "feat(course): expose searchOwnCourses via CourseService and tRPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Search-params parser & query-state types

**Files:**
- Create: `app/_components/Course/components/OwnCourses/types.ts`
- Create: `app/_components/Course/components/OwnCourses/searchParams.ts`
- Test: `app/_components/Course/components/OwnCourses/searchParams.test.ts`

**Interfaces:**
- Consumes: `GetOwnCoursesInput` from `server/entities/course/ownCourses.ts`.
- Produces: `OwnCoursesQueryState`, `OwnCoursesProps`; `parseOwnCoursesSearchParams(sp)`, `toSearchInput(query)`.

- [ ] **Step 1: Write the failing test**

```ts
// app/_components/Course/components/OwnCourses/searchParams.test.ts
import { describe, expect, it } from "vitest";
import { parseOwnCoursesSearchParams, toSearchInput } from "./searchParams";

describe("parseOwnCoursesSearchParams", () => {
	it("returns defaults for empty params", () => {
		expect(parseOwnCoursesSearchParams({})).toEqual({
			q: "",
			status: "all",
			category: "all",
			sort: "updated",
			page: 1,
		});
	});

	it("reads valid params", () => {
		expect(
			parseOwnCoursesSearchParams({
				q: "react",
				status: "draft",
				category: "development",
				sort: "title",
				page: "2",
			}),
		).toEqual({
			q: "react",
			status: "draft",
			category: "development",
			sort: "title",
			page: 2,
		});
	});

	it("falls back to defaults for invalid enum values", () => {
		const parsed = parseOwnCoursesSearchParams({ status: "bogus", sort: "bogus" });
		expect(parsed.status).toBe("all");
		expect(parsed.sort).toBe("updated");
	});

	it("coerces invalid or out-of-range page to 1", () => {
		expect(parseOwnCoursesSearchParams({ page: "0" }).page).toBe(1);
		expect(parseOwnCoursesSearchParams({ page: "-5" }).page).toBe(1);
		expect(parseOwnCoursesSearchParams({ page: "abc" }).page).toBe(1);
	});

	it("takes the first value when a param is repeated", () => {
		expect(parseOwnCoursesSearchParams({ status: ["draft", "published"] }).status).toBe("draft");
	});
});

describe("toSearchInput", () => {
	it("drops sentinel/empty values", () => {
		expect(
			toSearchInput({ q: "  ", status: "all", category: "all", sort: "updated", page: 1 }),
		).toEqual({ q: undefined, status: "all", category: undefined, sort: "updated", page: 1 });
	});

	it("passes through real values, trimming q", () => {
		expect(
			toSearchInput({ q: "  react ", status: "draft", category: "design", sort: "title", page: 2 }),
		).toEqual({ q: "react", status: "draft", category: "design", sort: "title", page: 2 });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project unit app/_components/Course/components/OwnCourses/searchParams.test.ts`
Expected: FAIL — cannot resolve `./searchParams`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/_components/Course/components/OwnCourses/types.ts
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";

export type OwnCoursesQueryState = {
	q: string;
	status: GetOwnCoursesInput["status"];
	category: string;
	sort: GetOwnCoursesInput["sort"];
	page: number;
};

export type OwnCoursesProps = {
	query: OwnCoursesQueryState;
};
```

```ts
// app/_components/Course/components/OwnCourses/searchParams.ts
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";
import type { OwnCoursesQueryState } from "./types";

type RawSearchParams = Record<string, string | string[] | undefined>;

const STATUSES = ["all", "draft", "published"] as const;
const SORTS = ["updated", "newest", "oldest", "title", "students"] as const;

const DEFAULT_STATUS: OwnCoursesQueryState["status"] = "all";
const DEFAULT_SORT: OwnCoursesQueryState["sort"] = "updated";

function first(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

function asStatus(value: string | undefined): OwnCoursesQueryState["status"] {
	return STATUSES.includes(value as OwnCoursesQueryState["status"])
		? (value as OwnCoursesQueryState["status"])
		: DEFAULT_STATUS;
}

function asSort(value: string | undefined): OwnCoursesQueryState["sort"] {
	return SORTS.includes(value as OwnCoursesQueryState["sort"])
		? (value as OwnCoursesQueryState["sort"])
		: DEFAULT_SORT;
}

function asPage(value: string | undefined): number {
	const page = Number.parseInt(value ?? "", 10);
	return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** Parse raw URL search params into the page's controlled query state. */
export function parseOwnCoursesSearchParams(sp: RawSearchParams): OwnCoursesQueryState {
	return {
		q: first(sp.q)?.slice(0, 200) ?? "",
		status: asStatus(first(sp.status)),
		category: first(sp.category) ?? "all",
		sort: asSort(first(sp.sort)),
		page: asPage(first(sp.page)),
	};
}

/** Shape the controlled query state into the tRPC `searchOwnCourses` input. */
export function toSearchInput(query: OwnCoursesQueryState): GetOwnCoursesInput {
	return {
		q: query.q.trim() || undefined,
		status: query.status,
		category: query.category === "all" ? undefined : query.category,
		sort: query.sort,
		page: query.page,
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project unit app/_components/Course/components/OwnCourses/searchParams.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add app/_components/Course/components/OwnCourses/types.ts app/_components/Course/components/OwnCourses/searchParams.ts app/_components/Course/components/OwnCourses/searchParams.test.ts
git commit -m "feat(course): add own-courses search-param parser and query types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `buildOwnCoursesHref` URL builder

**Files:**
- Create: `app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.ts`
- Test: `app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts`

**Interfaces:**
- Consumes: `OwnCoursesQueryState` from `../types`.
- Produces: `buildOwnCoursesHref(query: OwnCoursesQueryState): string`.

- [ ] **Step 1: Write the failing test**

```ts
// app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts
import { describe, expect, it } from "vitest";
import { buildOwnCoursesHref } from "./buildOwnCoursesHref";

describe("buildOwnCoursesHref", () => {
	it("omits defaults and empties", () => {
		expect(
			buildOwnCoursesHref({ q: "", status: "all", category: "all", sort: "updated", page: 1 }),
		).toBe("/instructor/courses");
	});

	it("includes only non-default params", () => {
		expect(
			buildOwnCoursesHref({ q: "react", status: "draft", category: "design", sort: "title", page: 3 }),
		).toBe("/instructor/courses?q=react&status=draft&category=design&sort=title&page=3");
	});

	it("omits page 1 but keeps a filter", () => {
		expect(
			buildOwnCoursesHref({ q: "", status: "published", category: "all", sort: "updated", page: 1 }),
		).toBe("/instructor/courses?status=published");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --project unit app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts`
Expected: FAIL — cannot resolve `./buildOwnCoursesHref`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.ts
import type { OwnCoursesQueryState } from "../types";

/** Build the canonical /instructor/courses href for a query state, dropping defaults. */
export function buildOwnCoursesHref(query: OwnCoursesQueryState): string {
	const params = new URLSearchParams();
	if (query.q) params.set("q", query.q);
	if (query.status !== "all") params.set("status", query.status);
	if (query.category && query.category !== "all") params.set("category", query.category);
	if (query.sort !== "updated") params.set("sort", query.sort);
	if (query.page > 1) params.set("page", String(query.page));
	const qs = params.toString();
	return `/instructor/courses${qs ? `?${qs}` : ""}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --project unit app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm check:write
git add app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.ts app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.test.ts
git commit -m "feat(course): add buildOwnCoursesHref URL helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Filter bar (constants + URL hook + client component)

**Files:**
- Create: `app/_components/Course/components/OwnCourses/constants.ts`
- Create: `app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl.ts`
- Create: `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/index.tsx`
- Create: `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/types.ts`

**Interfaces:**
- Consumes: `parseOwnCoursesSearchParams`, `buildOwnCoursesHref`, `OwnCoursesQueryState`, `GetOwnCoursesInput`, `useDebouncedValue` (existing, at `@/app/_components/Instructor/Students/hooks/useDebouncedValue`), `CATEGORIES` (`@/app/_components/Course/constants/categories`), Radix `Select`.
- Produces: `OwnCoursesFilters` (named export), `useOwnCoursesUrl`, `STATUS_OPTIONS`, `SORT_OPTIONS`, `CATEGORY_OPTIONS`, `OwnCoursesFiltersProps`.

> No automated test — this is a client component wired to the Next.js router (the existing `StudentsFilters`/`useStudentsUrl` are likewise verified by typecheck + manual). Verification is `pnpm typecheck` + the manual scenario in `validation.md`.

- [ ] **Step 1: Create the constants**

```ts
// app/_components/Course/components/OwnCourses/constants.ts
import CATEGORIES from "@/app/_components/Course/constants/categories";
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";

export const STATUS_OPTIONS: { value: GetOwnCoursesInput["status"]; label: string }[] = [
	{ value: "all", label: "All Status" },
	{ value: "published", label: "Published" },
	{ value: "draft", label: "Draft" },
];

export const SORT_OPTIONS: { value: GetOwnCoursesInput["sort"]; label: string }[] = [
	{ value: "updated", label: "Recently updated" },
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "title", label: "Title A–Z" },
	{ value: "students", label: "Most students" },
];

// Value mirrors browse: "All" → "all" sentinel, otherwise the lowercased category.
export const CATEGORY_OPTIONS: { value: string; label: string }[] = CATEGORIES.map((cat) => ({
	value: cat === "All" ? "all" : cat.toLowerCase(),
	label: cat,
}));
```

- [ ] **Step 2: Create the URL hook**

```ts
// app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl.ts
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { buildOwnCoursesHref } from "../helpers/buildOwnCoursesHref";
import { parseOwnCoursesSearchParams } from "../searchParams";
import type { OwnCoursesQueryState } from "../types";

type Update = Partial<Pick<OwnCoursesQueryState, "q" | "status" | "category" | "sort" | "page">>;

// Changing any of these resets pagination back to the first page.
const FILTER_KEYS = ["q", "status", "category", "sort"] as const;

/**
 * Writes the own-courses query into the URL (the source of truth). Reads the
 * current state from the URL, merges the partial update, resets `page` on any
 * filter/search change, and pushes the canonical href in a transition.
 */
export function useOwnCoursesUrl() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const update = useCallback(
		(updates: Update) => {
			const current = parseOwnCoursesSearchParams(
				Object.fromEntries(searchParams.entries()),
			);
			const changedFilter = FILTER_KEYS.some((key) => key in updates);
			const next: OwnCoursesQueryState = {
				...current,
				...updates,
				page: changedFilter && updates.page === undefined ? 1 : (updates.page ?? current.page),
			};
			const href = buildOwnCoursesHref(next);
			startTransition(() => router.push(href, { scroll: false }));
		},
		[router, searchParams],
	);

	return { update, isPending };
}
```

- [ ] **Step 3: Create the prop type**

```ts
// app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/types.ts
import type { OwnCoursesQueryState } from "../../types";

export type OwnCoursesFiltersProps = {
	query: OwnCoursesQueryState;
};
```

- [ ] **Step 4: Create the filter bar component**

```tsx
// app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/index.tsx
"use client";

import { ArrowUpDown, Filter, Search, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/app/_components/_shared/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import { useDebouncedValue } from "@/app/_components/Instructor/Students/hooks/useDebouncedValue";
import {
	CATEGORY_OPTIONS,
	SORT_OPTIONS,
	STATUS_OPTIONS,
} from "@/app/_components/Course/components/OwnCourses/constants";
import { useOwnCoursesUrl } from "@/app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl";
import type { GetOwnCoursesInput } from "@/server/entities/course/ownCourses";
import type { OwnCoursesFiltersProps } from "./types";

export function OwnCoursesFilters({ query }: OwnCoursesFiltersProps) {
	const { update } = useOwnCoursesUrl();
	const [search, setSearch] = useState(query.q);
	const debouncedSearch = useDebouncedValue(search, 300);

	// Keep the input in sync when the URL changes (e.g. back/forward navigation).
	useEffect(() => {
		setSearch(query.q);
	}, [query.q]);

	// Push the debounced search term to the URL once typing settles.
	// biome-ignore lint/correctness/useExhaustiveDependencies: react only to the debounced value
	useEffect(() => {
		if (debouncedSearch !== query.q) {
			update({ q: debouncedSearch });
		}
	}, [debouncedSearch]);

	return (
		<div className="flex flex-col gap-4 md:flex-row">
			<div className="relative flex-1">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-10"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search your courses..."
					value={search}
				/>
			</div>
			<Select
				onValueChange={(v) => update({ status: v as GetOwnCoursesInput["status"] })}
				value={query.status}
			>
				<SelectTrigger className="w-40">
					<Filter className="mr-2 h-4 w-4" />
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					{STATUS_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select onValueChange={(category) => update({ category })} value={query.category}>
				<SelectTrigger className="w-44">
					<Tag className="mr-2 h-4 w-4" />
					<SelectValue placeholder="Category" />
				</SelectTrigger>
				<SelectContent>
					{CATEGORY_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				onValueChange={(v) => update({ sort: v as GetOwnCoursesInput["sort"] })}
				value={query.sort}
			>
				<SelectTrigger className="w-44">
					<ArrowUpDown className="mr-2 h-4 w-4" />
					<SelectValue placeholder="Sort by" />
				</SelectTrigger>
				<SelectContent>
					{SORT_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
```

- [ ] **Step 5: Verify it typechecks**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
pnpm check:write
git add app/_components/Course/components/OwnCourses/constants.ts app/_components/Course/components/OwnCourses/hooks app/_components/Course/components/OwnCourses/components/OwnCoursesFilters
git commit -m "feat(course): add own-courses filter bar (search, status, category, sort)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Wire the page, server component & action

**Files:**
- Create: `app/_components/Course/components/OwnCourses/actions/searchOwnCourses.ts`
- Delete: `app/_components/Course/components/OwnCourses/actions/getOwnCourses.ts`
- Modify: `app/_components/Course/components/OwnCourses/index.tsx`
- Modify: `app/instructor/courses/page.tsx`
- Modify: `app/_components/Course/components/CourseCard/types.ts`

**Interfaces:**
- Consumes: `api.course.searchOwnCourses`, `toSearchInput`, `parseOwnCoursesSearchParams`, `buildOwnCoursesHref`, `OwnCoursesFilters`, `CoursePagination`, `CourseCard`, `OwnCoursesProps`.
- Produces: `searchOwnCourses(input)` action + `OwnCourse` type; the fully wired page.

- [ ] **Step 1: Create the action**

```ts
// app/_components/Course/components/OwnCourses/actions/searchOwnCourses.ts
import type {
	GetOwnCoursesInput,
	PaginatedOwnCourses,
} from "@/server/entities/course/ownCourses";
import { api } from "@/trpc/server";

export type OwnCourse = PaginatedOwnCourses["data"][number];

const EMPTY: PaginatedOwnCourses = {
	data: [],
	total: 0,
	currentPage: 1,
	lastPage: 1,
	perPage: 9,
};

export const searchOwnCourses = async (
	input: GetOwnCoursesInput,
): Promise<PaginatedOwnCourses> => {
	try {
		return await api.course.searchOwnCourses(input);
	} catch (error) {
		console.error(error);
		return EMPTY;
	}
};
```

- [ ] **Step 2: Re-point the `OwnCourse` import in CourseCard**

In `app/_components/Course/components/CourseCard/types.ts`, change the import path:

```ts
import type { OwnCourse } from "@/app/_components/Course/components/OwnCourses/actions/searchOwnCourses";
```

- [ ] **Step 3: Delete the old action**

```bash
git rm app/_components/Course/components/OwnCourses/actions/getOwnCourses.ts
```

- [ ] **Step 4: Rewrite the `OwnCourses` server component**

```tsx
// app/_components/Course/components/OwnCourses/index.tsx
import { CoursePagination } from "@/app/_components/Course/components/CoursePagination";
import CourseCard from "@/app/_components/Course/components/CourseCard";
import { searchOwnCourses } from "@/app/_components/Course/components/OwnCourses/actions/searchOwnCourses";
import { OwnCoursesFilters } from "@/app/_components/Course/components/OwnCourses/components/OwnCoursesFilters";
import { buildOwnCoursesHref } from "@/app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref";
import { toSearchInput } from "@/app/_components/Course/components/OwnCourses/searchParams";
import type { OwnCoursesProps } from "@/app/_components/Course/components/OwnCourses/types";

const OwnCourses = async ({ query }: OwnCoursesProps) => {
	const { data, lastPage } = await searchOwnCourses(toSearchInput(query));
	const currentPage = Math.min(query.page, lastPage);

	return (
		<div className="space-y-6">
			<OwnCoursesFilters query={query} />

			{data.length > 0 && (
				<div className="grid gap-6 md:grid-cols-3">
					{data.map((course) => (
						<CourseCard course={course} key={course.id} />
					))}
				</div>
			)}

			{data.length === 0 && (
				<p className="py-12 text-center text-muted-foreground">
					No courses found.
				</p>
			)}

			{lastPage > 1 && (
				<CoursePagination
					buildHref={(p) => buildOwnCoursesHref({ ...query, page: p })}
					currentPage={currentPage}
					totalPages={lastPage}
				/>
			)}
		</div>
	);
};

export default OwnCourses;
```

- [ ] **Step 5: Wire the page to parse `searchParams`**

```tsx
// app/instructor/courses/page.tsx
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
import { Button } from "@/app/_components/_shared/ui/button";
import OwnCourses from "@/app/_components/Course/components/OwnCourses";
import { parseOwnCoursesSearchParams } from "@/app/_components/Course/components/OwnCourses/searchParams";
import OwnCoursesStats from "@/app/_components/Course/components/OwnCoursesStats";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";

const CoursesPage = async ({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
	const query = parseOwnCoursesSearchParams(await searchParams);

	return (
		<PageShell
			action={
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.createCourse}>
						<Plus className="mr-2 h-4 w-4" />
						Create New Course
					</Link>
				</Button>
			}
			description="Manage and track your courses"
			title="My Courses"
		>
			<OwnCoursesStats />
			<OwnCourses query={query} />
		</PageShell>
	);
};

export default CoursesPage;
```

- [ ] **Step 6: Verify the full suite, types, lint, and build**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm exec vitest run --project unit app/_components/Course/components/OwnCourses`
Expected: PASS (parser + href tests).

Run: `pnpm check`
Expected: no lint/format errors in the new/changed files.

Run: `pnpm build`
Expected: build succeeds (confirms the RSC `searchParams` contract and no stale `getOwnCourses` import remains).

- [ ] **Step 7: Manual smoke test** (per `validation.md`)

Sign in as an instructor, open `/instructor/courses`, and verify: typing filters the grid and updates `?q=`; status/category/sort dropdowns filter & reorder and reset to page 1; pagination appears only past 9 results and navigates via `?page=`; an unmatched search shows "No courses found."; the Students page (`/instructor/students`) course dropdown still lists all courses.

- [ ] **Step 8: Commit**

```bash
pnpm check:write
git add app/_components/Course/components/OwnCourses app/instructor/courses/page.tsx app/_components/Course/components/CourseCard/types.ts
git commit -m "feat(course): wire instructor courses page to search, filters & pagination

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- FR1–FR3 (search) → Task 2 (`OR` query), Task 4 (parser/`q` sync), Task 6 (debounced input). ✓
- FR4–FR5 (status) → Task 2 (status where), Task 6 (status Select). ✓
- FR6–FR7 (category) → Task 2 (case-insensitive category), Task 6 (category Select). ✓
- FR8–FR9 (sort) → Task 2 (`ORDER_BY` map), Task 6 (sort Select). ✓
- FR10–FR12 (pagination) → Task 2 (`PAGE_SIZE`/`lastPage`), Task 7 (`CoursePagination`, hidden when `lastPage===1`). ✓
- FR13 (combination + reset to page 1) → Task 2 (AND where), Task 6 (`FILTER_KEYS` page reset). ✓
- FR14 (empty state) → Task 7 ("No courses found."). ✓
- FR15 (instructor scoping) → Task 2 (where pinned), Task 3 (`ctx.session.user.id`). ✓
- NFR security/perf → Task 2 (single findMany+count, select-narrowed, scoped); Task 3 (`instructorProcedure`). ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `searchOwnCourses(params: GetOwnCoursesInput & { instructorId })`, `PaginatedOwnCourses` (`data/total/currentPage/lastPage/perPage`), `OwnCoursesQueryState`, `toSearchInput`, `buildOwnCoursesHref`, and `OwnCourse = PaginatedOwnCourses["data"][number]` are used consistently across tasks. The action file is renamed `getOwnCourses.ts` → `searchOwnCourses.ts`, and its sole external consumer (`CourseCard/types.ts`) is updated in the same task.