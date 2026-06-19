# Dynamic "New Reviews" Sidebar Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`requirements.md`](./requirements.md) for FRs,
> [`spec.md`](./spec.md) for design, [`validation.md`](./validation.md) for checks.

**Goal:** Replace the hardcoded Reviews sidebar badge (`"5"`) with a real count of new reviews since
the instructor last opened the Reviews page, cleared automatically by opening that page.

**Architecture:** One nullable `InstructorProfile.reviewsLastViewedAt` column (migration-backfilled
to `now()`). Two `instructorProcedure`s — `getNewReviewsCount` (read) and `markReviewsViewed`
(stamp) — over new `CourseReviewRepository` / `InstructorRepository` methods. The RSC
`DashboardSidebar` fetches the count and passes it to the `Navigation` client component; a
`MarkReviewsViewed` client component on the Reviews page stamps on mount then `router.refresh()`es
to clear the badge.

**Tech Stack:** Next.js 16 App Router (RSC + client), tRPC, Prisma, Zod, Vitest, Tailwind.

**Codebase anchors (verified during planning):**
- `CourseReviewRepository` (`server/repositories/courseReview.repository.ts`) — `this.model.count`,
  instructor-ownership `where` `{ deletedAt: null, course: { is: { instructorId, deletedAt: null } } }`.
- `InstructorRepository` (`server/repositories/instructor.repository.ts`) — bare `BaseRepository`,
  `modelName = "instructorProfile"`; `InstructorProfile.userId` is `@unique`, so `this.model.update({ where: { userId }, ... })` and `this.model.findUnique({ where: { userId }, ... })` are valid.
- `InstructorService` (`server/services/instructor/instructor.service.ts`) — `logger.info` + repo
  composition pattern; instructor unit test mocks repos via explicit `vi.mock` objects
  (`server/services/instructor/instructor.service.test.ts:14`, add `countNewByInstructor` to the
  review mock and a new `mockInstructorRepo`).
- `instructorRouter` (`server/api/routers/instructor.ts`) — `instructorProcedure` + `try/catch` +
  `handleServiceError`; mutations use `.mutation(...)`.
- `DashboardSidebar` (`app/_components/Dashboard/Sidebar/index.tsx`) — RSC, already computes
  `isInstructor`; renders `<Navigation isInstructor={isInstructor} />`.
- `Navigation` (`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:61`) — the
  `badge: "5"` to remove; client component; `NavigationProps` in colocated `types.ts`.
- `INSTRUCTOR_URLS` (`lib/constants/urls/instructorUrls.ts`) — no `reviews` key yet.
- Client tRPC: `import { api } from "@/trpc/client"`; `api.x.y.useMutation({ onSuccess })`
  (`app/_components/Course/components/EnrollConfirmDialog/index.tsx:24,34`).
- Request helper pattern: `lib/requests/instructor/getStudentStatusCounts.ts` (try/catch → fallback).
- Integration tests do NOT auto-migrate (`test/setup.integration.ts`) — the `learnix_test` DB must
  be migrated before running them; factories in `test/factories.ts` (`makeUser`, `makeCourse`).

**Per-task conventions:** After each impl step, `pnpm typecheck` + `pnpm check` must be clean before
committing. Unit tests are colocated `*.test.ts`; repository tests `*.integration.test.ts` against
`learnix_test`. Services and repositories export singletons. Run unit with
`pnpm test:unit <path>`, integration with `pnpm test:integration <path>`.

---

## Task 1: Schema column + backfill migration

**Files:**
- Modify: `prisma/schema/instructor.prisma`
- Create: `prisma/migrations/<timestamp>_add_reviews_last_viewed_at/migration.sql` (generated, then edited)

- [ ] **Step 1: Add the column to the model**

```prisma
  stripeOnboardedAt    DateTime? @map("stripe_onboarded_at")
  reviewsLastViewedAt  DateTime? @map("reviews_last_viewed_at")
  createdAt          DateTime @default(now()) @map("created_at")
```

- [ ] **Step 2: Generate the migration WITHOUT applying it**

Run: `pnpm exec prisma migrate dev --create-only --name add_reviews_last_viewed_at`
Expected: a new `prisma/migrations/<ts>_add_reviews_last_viewed_at/migration.sql` containing the
`ALTER TABLE "instructor_profiles" ADD COLUMN "reviews_last_viewed_at" TIMESTAMP(3);`

- [ ] **Step 3: Append the backfill (FR9)** to that `migration.sql`

```sql
-- Backfill existing instructors so historical reviews are not counted as "new".
UPDATE "instructor_profiles"
SET "reviews_last_viewed_at" = NOW()
WHERE "reviews_last_viewed_at" IS NULL;
```

- [ ] **Step 4: Apply to dev DB + regenerate client**

Run: `pnpm db:migrate` (apply) then `pnpm generate` (Prisma client).
Expected: client types now include `reviewsLastViewedAt`.

- [ ] **Step 5: Apply to the test DB** (integration tests don't auto-migrate)

Run: `pnpm exec dotenv -e .env.test -- prisma migrate deploy`
(or the project's documented `.env.test` migrate command).
Expected: `learnix_test` has the new column.

- [ ] **Step 6: Verify** — `pnpm typecheck` clean.
- [ ] **Step 7: Commit** — `git commit -m "feat(reviews-badge): add InstructorProfile.reviewsLastViewedAt with backfill"`

---

## Task 2: Repository — `countNewByInstructor`

**Files:**
- Modify: `server/repositories/courseReview.repository.ts`
- Test: `server/repositories/courseReview.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test** (append to the suite; reuse `makeUser`/`makeCourse`/`makeReview`)

```ts
describe("CourseReviewRepository.countNewByInstructor", () => {
	it("counts only this instructor's non-deleted reviews created after `since`", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const other = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: CourseStatus.published,
		});
		const otherCourse = await makeCourse({
			instructorId: other.id,
			status: CourseStatus.published,
		});
		const s1 = await makeUser({ role: Role.STUDENT });
		const s2 = await makeUser({ role: Role.STUDENT });
		const s3 = await makeUser({ role: Role.STUDENT });
		const since = new Date("2025-02-15");
		await testDb.courseReview.create({
			data: { courseId: course.id, studentId: s1.id, rating: 5, comment: "old", createdAt: new Date("2025-01-01") },
		});
		await testDb.courseReview.create({
			data: { courseId: course.id, studentId: s2.id, rating: 4, comment: "new", createdAt: new Date("2025-03-01") },
		});
		await testDb.courseReview.create({
			data: { courseId: otherCourse.id, studentId: s3.id, rating: 5, comment: "other", createdAt: new Date("2025-03-01") },
		});

		expect(await courseReviewRepository.countNewByInstructor(instructor.id, since)).toBe(1);
	});

	it("counts all of the instructor's reviews when `since` is null", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: instructor.id, status: CourseStatus.published });
		const s1 = await makeUser({ role: Role.STUDENT });
		await makeReview({ courseId: course.id, studentId: s1.id, rating: 5 });

		expect(await courseReviewRepository.countNewByInstructor(instructor.id, null)).toBe(1);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test:integration server/repositories/courseReview.repository.integration.test.ts` → "countNewByInstructor is not a function".

- [ ] **Step 3: Implement** (add method to `CourseReviewRepository`)

```ts
countNewByInstructor(instructorId: string, since: Date | null): Promise<number> {
	return this.model.count({
		where: {
			deletedAt: null,
			course: { is: { instructorId, deletedAt: null } },
			...(since ? { createdAt: { gt: since } } : {}),
		},
	});
}
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews-badge): courseReviewRepository.countNewByInstructor"`

---

## Task 3: Repository — instructor timestamp read/write

**Files:**
- Modify: `server/repositories/instructor.repository.ts`
- Test: `server/repositories/instructor.repository.integration.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeUser } from "@/test/factories";
import { instructorRepository } from "./instructor.repository";

async function makeInstructorProfile(userId: string, reviewsLastViewedAt: Date | null = null) {
	return testDb.instructorProfile.create({
		data: {
			userId,
			areaOfExpertise: "x",
			teachingExperience: "x",
			professionalBio: "x",
			courseIdea: "x",
			reviewsLastViewedAt,
		},
	});
}

describe("InstructorRepository.getReviewsLastViewedAt", () => {
	it("returns the stored timestamp (or null)", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		const when = new Date("2025-05-01T00:00:00.000Z");
		await makeInstructorProfile(user.id, when);
		expect(await instructorRepository.getReviewsLastViewedAt(user.id)).toEqual(when);
	});
});

describe("InstructorRepository.touchReviewsViewed", () => {
	it("stamps reviewsLastViewedAt to ~now", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		await makeInstructorProfile(user.id, null);
		const before = Date.now();
		await instructorRepository.touchReviewsViewed(user.id);
		const after = await instructorRepository.getReviewsLastViewedAt(user.id);
		expect(after).not.toBeNull();
		expect((after as Date).getTime()).toBeGreaterThanOrEqual(before - 1000);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — methods missing.

- [ ] **Step 3: Implement**

```ts
async getReviewsLastViewedAt(userId: string): Promise<Date | null> {
	const profile = await this.model.findUnique({
		where: { userId },
		select: { reviewsLastViewedAt: true },
	});
	return profile?.reviewsLastViewedAt ?? null;
}

async touchReviewsViewed(userId: string): Promise<void> {
	await this.model.update({
		where: { userId },
		data: { reviewsLastViewedAt: new Date() },
	});
}
```

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews-badge): instructorRepository reviews-viewed timestamp accessors"`

---

## Task 4: Service — `getNewReviewsCount` + `markReviewsViewed`

**Files:**
- Modify: `server/services/instructor/instructor.service.ts`
- Test: `server/services/instructor/instructor.service.test.ts`

- [ ] **Step 1: Write the failing test** (extend the existing mocks)

Add `countNewByInstructor: vi.fn()` to `mockReviewRepo`, and a new instructor-repo mock:

```ts
const mockInstructorRepo = {
	getReviewsLastViewedAt: vi.fn(),
	touchReviewsViewed: vi.fn(),
};
vi.mock("@/server/repositories/instructor.repository", () => ({
	instructorRepository: mockInstructorRepo,
}));
```

Then:

```ts
describe("InstructorService.getNewReviewsCount", () => {
	beforeEach(() => vi.clearAllMocks());

	it("counts reviews created after the last-viewed timestamp", async () => {
		const since = new Date("2025-05-01");
		mockInstructorRepo.getReviewsLastViewedAt.mockResolvedValue(since);
		mockReviewRepo.countNewByInstructor.mockResolvedValue(3);

		const count = await instructorService.getNewReviewsCount(INSTRUCTOR_ID);

		expect(count).toBe(3);
		expect(mockReviewRepo.countNewByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, since);
	});

	it("passes null through when the instructor never viewed", async () => {
		mockInstructorRepo.getReviewsLastViewedAt.mockResolvedValue(null);
		mockReviewRepo.countNewByInstructor.mockResolvedValue(0);

		const count = await instructorService.getNewReviewsCount(INSTRUCTOR_ID);

		expect(count).toBe(0);
		expect(mockReviewRepo.countNewByInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, null);
	});
});

describe("InstructorService.markReviewsViewed", () => {
	beforeEach(() => vi.clearAllMocks());

	it("touches the timestamp and returns success", async () => {
		mockInstructorRepo.touchReviewsViewed.mockResolvedValue(undefined);
		const result = await instructorService.markReviewsViewed(INSTRUCTOR_ID);
		expect(result).toEqual({ success: true });
		expect(mockInstructorRepo.touchReviewsViewed).toHaveBeenCalledWith(INSTRUCTOR_ID);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL** — methods missing.

- [ ] **Step 3: Implement** (add `import { instructorRepository } from "@/server/repositories/instructor.repository";` is already present; add methods)

```ts
async getNewReviewsCount(instructorId: string): Promise<number> {
	logger.info("Getting instructor new reviews count", { instructorId });
	const since = await instructorRepository.getReviewsLastViewedAt(instructorId);
	return courseReviewRepository.countNewByInstructor(instructorId, since);
}

async markReviewsViewed(instructorId: string): Promise<{ success: true }> {
	logger.info("Marking instructor reviews viewed", { instructorId });
	await instructorRepository.touchReviewsViewed(instructorId);
	return { success: true };
}
```

> Note: `getNewReviewsCount`/`markReviewsViewed` key on the instructor `User` id, which equals
> `InstructorProfile.userId` — the same id used everywhere else in this service.

- [ ] **Step 4: Run it, expect PASS** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 5: Commit** — `git commit -m "feat(reviews-badge): instructor service new-count + mark-viewed"`

---

## Task 5: Router — count query + mark-viewed mutation

**Files:**
- Modify: `server/api/routers/instructor.ts`

- [ ] **Step 1: Implement** (add inside `createTRPCRouter({ ... })`)

```ts
	getNewReviewsCount: instructorProcedure.query(async ({ ctx }) => {
		try {
			return await instructorService.getNewReviewsCount(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),

	markReviewsViewed: instructorProcedure.mutation(async ({ ctx }) => {
		try {
			return await instructorService.markReviewsViewed(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews-badge): instructor router new-count + mark-viewed"`

---

## Task 6: Request helper — `getNewReviewsCount`

**Files:**
- Create: `lib/requests/instructor/getNewReviewsCount.ts`

- [ ] **Step 1: Implement**

```ts
import { api } from "@/trpc/server";

const getNewReviewsCount = async (): Promise<number> => {
	try {
		return (await api.instructor.getNewReviewsCount()) ?? 0;
	} catch (error) {
		console.error("Error fetching new reviews count:", error);
		return 0;
	}
};

export default getNewReviewsCount;
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews-badge): RSC request helper for new reviews count"`

---

## Task 7: URL constant + Navigation badge

**Files:**
- Modify: `lib/constants/urls/instructorUrls.ts`
- Modify: `app/_components/Dashboard/Sidebar/components/Navigation/types.ts`
- Modify: `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`

- [ ] **Step 1: Add the `reviews` URL**

```ts
	courses: `${MAIN_URL}/courses`,
	reviews: `${MAIN_URL}/reviews`,
	createCourse: `${MAIN_URL}/courses/new`,
```

- [ ] **Step 2: Extend `NavigationProps`**

```ts
export type NavigationProps = {
	isInstructor: boolean;
	reviewsCount: number;
};
```

- [ ] **Step 3: Wire the dynamic badge into `Navigation`**

- Remove `badge: "5"` from the Reviews item, and switch its `href` to `INSTRUCTOR_URLS.reviews`.
- Add a `formatBadge` helper and accept `reviewsCount`:

```tsx
function formatBadge(count: number): string | undefined {
	if (count <= 0) return undefined;
	return count > 9 ? "9+" : String(count);
}

const SidebarNavigation = ({ isInstructor, reviewsCount }: NavigationProps) => {
	const pathname = usePathname();
	const navItems = isInstructor ? instructorItems : studentItems;

	return (
		<nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
			{navItems.map((item) => {
				const Icon = item.icon;
				const isActive = pathname === item.href;
				const badge =
					item.href === INSTRUCTOR_URLS.reviews
						? formatBadge(reviewsCount)
						: item.badge;
				return (
					<Link /* ...unchanged classes... */ href={item.href} key={item.href}>
						<Icon className="h-5 w-5" />
						<span className="flex-1">{item.title}</span>
						{badge && (
							<span
								aria-label={`${reviewsCount} new reviews`}
								className="flex h-5 w-5 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs"
							>
								{badge}
							</span>
						)}
					</Link>
				);
			})}
		</nav>
	);
};
```

> Keep the existing `Link` className block exactly as-is; only the `badge` derivation and the
> `aria-label` are added. The Messages item keeps its static `badge` (out of scope).

- [ ] **Step 4: Verify** — `pnpm typecheck` + `pnpm check` clean (note: `DashboardSidebar` now
  fails typecheck until Task 8 passes `reviewsCount` — implement Task 8 before committing, or pass a
  temporary `reviewsCount={0}`). Prefer committing Tasks 7+8 together.
- [ ] **Step 5: Commit (with Task 8)** — see Task 8.

---

## Task 8: DashboardSidebar fetches and passes the count

**Files:**
- Modify: `app/_components/Dashboard/Sidebar/index.tsx`

- [ ] **Step 1: Implement**

```tsx
import getNewReviewsCount from "@/lib/requests/instructor/getNewReviewsCount";
// ...
const DashboardSidebar = async () => {
	const { user } = requireAuth(await getSession());
	const { name, role } = user;
	const isInstructor = role === Role.INSTRUCTOR;

	const reviewsCount = isInstructor ? await getNewReviewsCount() : 0;
	// ...
	<Navigation isInstructor={isInstructor} reviewsCount={reviewsCount} />
	// ...
};
```

- [ ] **Step 2: Verify** — `pnpm typecheck` + `pnpm check` clean; `pnpm build` succeeds.
- [ ] **Step 3: Commit** — `git commit -m "feat(reviews-badge): render real new-reviews count in sidebar"`

---

## Task 9: `MarkReviewsViewed` clears the badge on open

**Files:**
- Create: `app/_components/Instructor/Reviews/MarkReviewsViewed/index.tsx`
- Modify: `app/instructor/reviews/page.tsx`

- [ ] **Step 1: Implement the client component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "@/trpc/client";

export function MarkReviewsViewed() {
	const router = useRouter();
	const hasRun = useRef(false);
	const markViewed = api.instructor.markReviewsViewed.useMutation({
		onSuccess: () => router.refresh(),
		onError: (error) => console.error("Failed to mark reviews viewed:", error),
	});

	useEffect(() => {
		if (hasRun.current) return;
		hasRun.current = true;
		markViewed.mutate();
	}, [markViewed]);

	return null;
}
```

- [ ] **Step 2: Render it on the Reviews page** (add to `app/instructor/reviews/page.tsx`)

```tsx
import { MarkReviewsViewed } from "@/app/_components/Instructor/Reviews/MarkReviewsViewed";
// ...inside <PageShell>, alongside the existing children:
			<MarkReviewsViewed />
			<ReviewsStats stats={stats} />
			<ReviewsResults query={query} reviews={reviews} />
```

- [ ] **Step 3: Verify** — `pnpm typecheck` + `pnpm check` clean; `pnpm build` succeeds. Manually:
  with a new review present the badge shows; opening `/instructor/reviews` clears it without a hard
  reload (validation.md scenarios 1–3).

- [ ] **Step 4: Commit** — `git commit -m "feat(reviews-badge): clear badge on opening the reviews page"`

---

## Self-review (run before handoff)

- **Spec coverage:**
  - FR1 (badge count) → Task 2, 4, 7, 8 · FR2 (`9+`) → 7 (`formatBadge`) · FR3 (non-instructors) →
    8 (`isInstructor ? … : 0`) · FR4 (no hardcoded `"5"`) → 7.
  - FR5 (clear on open) → 9 · FR6 (persists) → 1, 3, 9 · FR7 (idempotent/safe) → 3 (`touch`), 4, 9.
  - FR8 (column) → 1 · FR9 (backfill) → 1 · FR10 (null safety) → 2 (`since ? … : true`), 4.
- **Placeholder scan:** no `TBD`/`TODO`; all code steps complete.
- **Type consistency:** `reviewsLastViewedAt`, `countNewByInstructor(instructorId, since)`,
  `getReviewsLastViewedAt`/`touchReviewsViewed`, `reviewsCount`, `markReviewsViewed → { success: true }`
  match across schema, repos, service, router, helper, and components.

## Final verification (see [`validation.md`](./validation.md) for detail)

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- An instructor with new reviews sees the real badge; opening the Reviews page clears it without a
  hard reload and the cleared state survives reload; a brand-new/existing-post-migration instructor
  sees no badge; students see no badge.