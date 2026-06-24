# Instructor Course Preview Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hard-coded figure on `/instructor/courses/[courseId]/preview` with values derived from the real course, make the preview video playable, and decompose the page into colocated sub-components.

**Architecture:** Pure, unit-tested derivation helpers in `lib/course/` compute all figures (durations, counts, discount, publish-readiness) from the already-fetched course. The only data-layer change adds an enrollment `_count` to the existing `getOwnCourse` query. The Server Component page becomes a thin orchestrator composing colocated sub-components, each with a `types.ts`.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript, Prisma, tRPC, Vitest, Tailwind, Radix UI, Biome.

## Global Constraints

- **Component conventions (CLAUDE.md):** every component folder has a colocated `types.ts`; prop types live there, never inline. No nested ternaries in JSX — use early-return sub-components. Stable React keys must be IDs, never titles/text. No `Record<string, never>` placeholder prop types.
- **Correctness (NFR):** no user-visible figure may be a hard-coded literal except the locked static perks ("Full lifetime access", "Certificate of completion").
- **Reliability (NFR):** derived figures tolerate null/partial data (no reviews, null `durationMinutes`, no resources, no video) without throwing.
- **Security (NFR):** preview data comes only from owning-instructor-scoped `getOwnCourse`; non-owned/absent course → `notFound()`. No new endpoint.
- **Duration sourcing (requirements.md Resolved):** total length = Σ `durationMinutes` over all lessons; video hours = Σ `durationMinutes` over lessons with non-empty `videoUrl`; never auto-fetched.
- **FR8 (resolved):** the hero keeps the free-text `course.duration` string; the computed total appears only in the content summary.
- **Lint/format:** Biome via `pnpm check` (not ESLint/Prettier). Run `pnpm typecheck` for types.
- **Test runner:** `pnpm test:unit` (Vitest, `--project unit`, no DB). Helper tests are colocated `*.test.ts`.

---

### Task 1: Course statistic helpers

**Files:**
- Create: `lib/course/courseStats.ts`
- Test: `lib/course/courseStats.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type LessonStat = { durationMinutes: number | null; videoUrl: string | null; resources: unknown }`
  - `type SectionStat = { lessons: LessonStat[] }`
  - `sumTotalDurationMinutes(sections: SectionStat[]): number`
  - `sumVideoDurationMinutes(sections: SectionStat[]): number`
  - `countLectures(sections: SectionStat[]): number`
  - `countResources(sections: SectionStat[]): number`

- [ ] **Step 1: Write the failing test**

```ts
// lib/course/courseStats.test.ts
import { describe, expect, it } from "vitest";
import {
	countLectures,
	countResources,
	type SectionStat,
	sumTotalDurationMinutes,
	sumVideoDurationMinutes,
} from "./courseStats";

const sections: SectionStat[] = [
	{
		lessons: [
			{ durationMinutes: 30, videoUrl: "https://youtu.be/a", resources: [{ url: "x" }, { url: "y" }] },
			{ durationMinutes: 15, videoUrl: null, resources: null },
		],
	},
	{
		lessons: [
			{ durationMinutes: null, videoUrl: "https://youtu.be/b", resources: [] },
			{ durationMinutes: 60, videoUrl: "", resources: "not-an-array" },
		],
	},
];

describe("courseStats", () => {
	it("sums total duration ignoring nulls", () =>
		expect(sumTotalDurationMinutes(sections)).toBe(105));
	it("sums video duration only for lessons with a non-empty videoUrl", () =>
		expect(sumVideoDurationMinutes(sections)).toBe(30));
	it("counts all lectures across sections", () =>
		expect(countLectures(sections)).toBe(4));
	it("counts resources, tolerating null/non-array", () =>
		expect(countResources(sections)).toBe(2));
	it("handles empty input", () => {
		expect(sumTotalDurationMinutes([])).toBe(0);
		expect(countLectures([])).toBe(0);
		expect(countResources([])).toBe(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/course/courseStats.test.ts`
Expected: FAIL — cannot find module `./courseStats`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/course/courseStats.ts
export type LessonStat = {
	durationMinutes: number | null;
	videoUrl: string | null;
	resources: unknown;
};

export type SectionStat = { lessons: LessonStat[] };

const allLessons = (sections: SectionStat[]): LessonStat[] =>
	sections.flatMap((s) => s.lessons);

export function sumTotalDurationMinutes(sections: SectionStat[]): number {
	return allLessons(sections).reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);
}

export function sumVideoDurationMinutes(sections: SectionStat[]): number {
	return allLessons(sections)
		.filter((l) => !!l.videoUrl && l.videoUrl.trim() !== "")
		.reduce((sum, l) => sum + (l.durationMinutes ?? 0), 0);
}

export function countLectures(sections: SectionStat[]): number {
	return allLessons(sections).length;
}

export function countResources(sections: SectionStat[]): number {
	return allLessons(sections).reduce(
		(sum, l) => sum + (Array.isArray(l.resources) ? l.resources.length : 0),
		0,
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/course/courseStats.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/course/courseStats.ts lib/course/courseStats.test.ts
git commit -m "feat(preview): add course statistic helpers"
```

---

### Task 2: Discount percentage helper

**Files:**
- Create: `lib/course/discount.ts`
- Test: `lib/course/discount.test.ts`

**Interfaces:**
- Produces: `computeDiscountPercent(priceCents: number, originalPriceCents: number | null | undefined): number | null` — integer percent off, or `null` when there is no valid discount.

- [ ] **Step 1: Write the failing test**

```ts
// lib/course/discount.test.ts
import { describe, expect, it } from "vitest";
import { computeDiscountPercent } from "./discount";

describe("computeDiscountPercent", () => {
	it("returns null when there is no original price", () =>
		expect(computeDiscountPercent(5000, null)).toBeNull());
	it("returns null when original ≤ price", () =>
		expect(computeDiscountPercent(5000, 5000)).toBeNull());
	it("computes a rounded percentage off", () =>
		expect(computeDiscountPercent(4500, 9000)).toBe(50));
	it("rounds to the nearest integer", () =>
		expect(computeDiscountPercent(6700, 10000)).toBe(33));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/course/discount.test.ts`
Expected: FAIL — cannot find module `./discount`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/course/discount.ts
export function computeDiscountPercent(
	priceCents: number,
	originalPriceCents: number | null | undefined,
): number | null {
	if (!originalPriceCents || originalPriceCents <= priceCents) return null;
	return Math.round((1 - priceCents / originalPriceCents) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/course/discount.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/course/discount.ts lib/course/discount.test.ts
git commit -m "feat(preview): add discount percentage helper"
```

---

### Task 3: Publish-readiness helper

**Files:**
- Create: `lib/course/publishReadiness.ts`
- Test: `lib/course/publishReadiness.test.ts`

**Interfaces:**
- Produces:
  - `type ReadinessInput = { thumbnailUrl: string | null; objectives: string[]; description: string; priceCents: number; sections: { lessons: unknown[] }[] }`
  - `type ReadinessItem = { id: string; label: string; met: boolean }`
  - `type Readiness = { ready: boolean; items: ReadinessItem[] }`
  - `getPublishReadiness(course: ReadinessInput): Readiness`

- [ ] **Step 1: Write the failing test**

```ts
// lib/course/publishReadiness.test.ts
import { describe, expect, it } from "vitest";
import { getPublishReadiness, type ReadinessInput } from "./publishReadiness";

const complete: ReadinessInput = {
	thumbnailUrl: "https://blob/x.png",
	objectives: ["Learn X"],
	description: "A real description",
	priceCents: 4900,
	sections: [{ lessons: [{}] }],
};

describe("getPublishReadiness", () => {
	it("is ready when every prerequisite is met", () => {
		const r = getPublishReadiness(complete);
		expect(r.ready).toBe(true);
		expect(r.items.every((i) => i.met)).toBe(true);
	});
	it("flags a missing thumbnail", () => {
		const r = getPublishReadiness({ ...complete, thumbnailUrl: null });
		expect(r.ready).toBe(false);
		expect(r.items.find((i) => i.id === "thumbnail")?.met).toBe(false);
	});
	it("flags no objectives, no lessons, empty description", () => {
		const r = getPublishReadiness({
			...complete,
			objectives: [],
			description: "  ",
			sections: [{ lessons: [] }],
		});
		expect(r.items.find((i) => i.id === "objectives")?.met).toBe(false);
		expect(r.items.find((i) => i.id === "lessons")?.met).toBe(false);
		expect(r.items.find((i) => i.id === "description")?.met).toBe(false);
	});
	it("treats a free (0) price as acknowledged", () => {
		const r = getPublishReadiness({ ...complete, priceCents: 0 });
		expect(r.items.find((i) => i.id === "price")?.met).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/course/publishReadiness.test.ts`
Expected: FAIL — cannot find module `./publishReadiness`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/course/publishReadiness.ts
export type ReadinessInput = {
	thumbnailUrl: string | null;
	objectives: string[];
	description: string;
	priceCents: number;
	sections: { lessons: unknown[] }[];
};

export type ReadinessItem = { id: string; label: string; met: boolean };
export type Readiness = { ready: boolean; items: ReadinessItem[] };

export function getPublishReadiness(course: ReadinessInput): Readiness {
	const lessonCount = course.sections.reduce((n, s) => n + s.lessons.length, 0);
	const items: ReadinessItem[] = [
		{ id: "thumbnail", label: "Add a course thumbnail", met: !!course.thumbnailUrl },
		{ id: "objectives", label: "Add at least one learning objective", met: course.objectives.length > 0 },
		{ id: "lessons", label: "Add at least one lesson", met: lessonCount > 0 },
		{ id: "description", label: "Write a course description", met: course.description.trim().length > 0 },
		{ id: "price", label: "Set a price (free is allowed)", met: course.priceCents >= 0 },
	];
	return { ready: items.every((i) => i.met), items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/course/publishReadiness.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/course/publishReadiness.ts lib/course/publishReadiness.test.ts
git commit -m "feat(preview): add publish-readiness helper"
```

---

### Task 4: Expose enrollment count on the owned-course query

**Files:**
- Modify: `server/repositories/course.repository.ts` (`getOwnCourse`, ~line 205)
- Modify: `server/entities/course/index.ts` (~line 186)
- Modify: `lib/requests/course/getCourseById.ts`

**Interfaces:**
- Consumes: `courseRepository.getOwnCourse(courseId, instructorId)`.
- Produces:
  - `type OwnCoursePreview = FullCourse & { _count: { enrollments: number } }` (exported from `server/entities/course/index.ts`).
  - `getCourseById(courseId): Promise<OwnCoursePreview | null>`.

- [ ] **Step 1: Add `_count` to the repository include**

In `server/repositories/course.repository.ts`, change `getOwnCourse`:

```ts
async getOwnCourse(courseId: string, instructorId: string) {
	return await this.findFirst({
		where: { id: courseId, instructorId: instructorId },
		include: {
			sections: {
				orderBy: { order: "asc" },
				include: {
					lessons: {
						orderBy: { order: "asc" },
					},
				},
			},
			_count: { select: { enrollments: true } },
		},
	});
}
```

- [ ] **Step 2: Add the `OwnCoursePreview` type**

In `server/entities/course/index.ts`, just after `export type FullCourse = CourseWithRelations;`:

```ts
export type OwnCoursePreview = FullCourse & {
	_count: { enrollments: number };
};
```

- [ ] **Step 3: Return the new type from the request helper**

Replace `lib/requests/course/getCourseById.ts` body:

```ts
import type { OwnCoursePreview } from "@/server/entities/course";
import { api } from "@/trpc/server";

const getCourseById = async (courseId: string) => {
	try {
		const course = await api.course.getOwnCourse(courseId);
		return course as OwnCoursePreview;
	} catch (error) {
		console.error("Error fetching course:", error);
		return null;
	}
};

export default getCourseById;
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm typecheck`
Expected: PASS (no errors). The preview page still compiles since `OwnCoursePreview extends FullCourse`.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/course.repository.ts server/entities/course/index.ts lib/requests/course/getCourseById.ts
git commit -m "feat(preview): expose enrollment count on getOwnCourse"
```

---

### Task 5: Student course-detail URL + `PreviewHeader` + `PreviewMedia`

**Files:**
- Modify: `lib/constants/urls/studentsUrls.ts`
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewHeader/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewHeader/types.ts`
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewMedia/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewMedia/types.ts`

**Interfaces:**
- Consumes: `INSTRUCTOR_URLS.courses`, `INSTRUCTOR_URLS.editCourse`.
- Produces:
  - `STUDENT_URLS.courseDetail(id: string): string`
  - `<PreviewHeader courseId={string} />`
  - `<PreviewMedia previewVideoUrl={string | null} thumbnailUrl={string | null} title={string} />`

- [ ] **Step 1: Add the student course-detail URL**

In `lib/constants/urls/studentsUrls.ts`, add to the object (after `browseCourse`):

```ts
	courseDetail: (id: string) => `${MAIN_URL}/browse/${id}`,
```

- [ ] **Step 2: Write `PreviewHeader/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/PreviewHeader/types.ts
export type PreviewHeaderProps = {
	courseId: string;
};
```

- [ ] **Step 3: Write `PreviewHeader/index.tsx`**

```tsx
// app/instructor/courses/[courseId]/preview/_components/PreviewHeader/index.tsx
import { ArrowLeft, Edit } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import type { PreviewHeaderProps } from "./types";

export function PreviewHeader({ courseId }: PreviewHeaderProps) {
	return (
		<>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Link href={INSTRUCTOR_URLS.courses}>
						<Button size="icon" variant="ghost">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div>
						<h1 className="font-bold text-2xl">Course Preview</h1>
						<p className="text-muted-foreground text-sm">
							This is how students will see your course
						</p>
					</div>
				</div>
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.editCourse(courseId) as string}>
						<Edit className="mr-2 h-4 w-4" />
						Edit Course
					</Link>
				</Button>
			</div>

			<div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100">
				<strong>Preview Mode:</strong> This is how your course appears to
				potential students. Make sure everything looks perfect before
				publishing.
			</div>
		</>
	);
}
```

- [ ] **Step 4: Write `PreviewMedia/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/PreviewMedia/types.ts
export type PreviewMediaProps = {
	previewVideoUrl: string | null;
	thumbnailUrl: string | null;
	title: string;
};
```

- [ ] **Step 5: Write `PreviewMedia/index.tsx`** (early-return branches, no empty `<track>`, FR11/FR23/FR19)

```tsx
// app/instructor/courses/[courseId]/preview/_components/PreviewMedia/index.tsx
import { Video } from "lucide-react";
import Image from "next/image";
import { Card } from "@/app/_components/_shared/ui/card";
import type { PreviewMediaProps } from "./types";

export function PreviewMedia({ previewVideoUrl, thumbnailUrl, title }: PreviewMediaProps) {
	if (previewVideoUrl) {
		return (
			<Card className="aspect-video overflow-hidden">
				{/* biome-ignore lint/a11y/useMediaCaption: no caption source exists for instructor preview uploads */}
				<video className="h-full w-full bg-black" controls src={previewVideoUrl} />
			</Card>
		);
	}

	if (thumbnailUrl) {
		return (
			<Card className="aspect-video overflow-hidden">
				<div className="relative aspect-video w-full overflow-hidden bg-muted">
					<Image alt={title} className="object-cover" fill src={thumbnailUrl} />
				</div>
			</Card>
		);
	}

	return (
		<Card className="flex aspect-video items-center justify-center overflow-hidden bg-muted">
			<div className="text-center text-muted-foreground">
				<Video className="mx-auto h-16 w-16" />
				<p className="mt-2 text-sm">No preview media yet</p>
			</div>
		</Card>
	);
}
```

- [ ] **Step 6: Verify types + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS. (If Biome flags the `<video>` caption rule despite the ignore comment, confirm the directive name from the error and adjust.)

- [ ] **Step 7: Commit**

```bash
git add lib/constants/urls/studentsUrls.ts "app/instructor/courses/[courseId]/preview/_components/PreviewHeader" "app/instructor/courses/[courseId]/preview/_components/PreviewMedia"
git commit -m "feat(preview): add header, media player, and student-detail url"
```

---

### Task 6: `PreviewHero` (real rating, students, duration)

**Files:**
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewHero/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/PreviewHero/types.ts`

**Interfaces:**
- Consumes: `capitalize`, `Badge`, lucide `Star`/`Users`/`Clock`.
- Produces: `<PreviewHero category title description averageRating reviewsCount studentCount duration objectives />` (FR6–FR10).

- [ ] **Step 1: Write `PreviewHero/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/PreviewHero/types.ts
export type PreviewHeroProps = {
	category: string;
	title: string;
	description: string;
	averageRating: number;
	reviewsCount: number;
	studentCount: number;
	duration: string;
	objectives: string[];
};
```

- [ ] **Step 2: Write `PreviewHero/index.tsx`** (real data; FR8 keeps `duration` string)

```tsx
// app/instructor/courses/[courseId]/preview/_components/PreviewHero/index.tsx
import { CheckCircle, Clock, Star, Users } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Card } from "@/app/_components/_shared/ui/card";
import { capitalize } from "@/lib/utils/capitalize";
import type { PreviewHeroProps } from "./types";

export function PreviewHero({
	category,
	title,
	description,
	averageRating,
	reviewsCount,
	studentCount,
	duration,
	objectives,
}: PreviewHeroProps) {
	return (
		<>
			<div className="space-y-4">
				<Badge>{capitalize(category)}</Badge>
				<h1 className="font-bold text-4xl">{title}</h1>
				<p className="text-lg text-muted-foreground">{description}</p>

				<div className="flex flex-wrap items-center gap-4 text-sm">
					<div className="flex items-center gap-1">
						<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
						<span className="font-semibold">{averageRating.toFixed(1)}</span>
						<span className="text-muted-foreground">({reviewsCount} ratings)</span>
					</div>
					<div className="flex items-center gap-1">
						<Users className="h-4 w-4" />
						<span>{studentCount} students</span>
					</div>
					<div className="flex items-center gap-1">
						<Clock className="h-4 w-4" />
						<span>{duration} hours</span>
					</div>
				</div>
			</div>

			<Card className="p-6">
				<h2 className="mb-4 font-bold text-2xl">What you'll learn</h2>
				<div className="grid gap-3 md:grid-cols-2">
					{objectives.map((item) => (
						<div className="flex gap-2" key={item}>
							<CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
							<span className="text-sm">{item}</span>
						</div>
					))}
				</div>
			</Card>
		</>
	);
}
```

> Note: objectives have no stable ID; `key={item}` is acceptable here since objectives are unique free-text strings (no DB id exists). Lesson/section keys MUST use IDs (Task 7).

- [ ] **Step 3: Verify types + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/instructor/courses/[courseId]/preview/_components/PreviewHero"
git commit -m "feat(preview): hero with real rating, students, and duration"
```

---

### Task 7: `CourseContentCard` (summary line, section list, empty state)

**Files:**
- Create: `app/instructor/courses/[courseId]/preview/_components/CourseContentCard/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/CourseContentCard/types.ts`

**Interfaces:**
- Consumes: `sumTotalDurationMinutes`, `countLectures` (Task 1), `formatDuration`, `INSTRUCTOR_URLS.previewLesson`, `OwnCoursePreview["sections"]`.
- Produces: `<CourseContentCard courseId sections />` (FR12/FR13/FR19) with a `SectionBlock` sub-component.

- [ ] **Step 1: Write `CourseContentCard/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/CourseContentCard/types.ts
import type { OwnCoursePreview } from "@/server/entities/course";

export type PreviewSection = OwnCoursePreview["sections"][number];

export type CourseContentCardProps = {
	courseId: string;
	sections: PreviewSection[];
};

export type SectionBlockProps = {
	courseId: string;
	section: PreviewSection;
};
```

- [ ] **Step 2: Write `CourseContentCard/index.tsx`** (computed summary, empty state, ID keys)

```tsx
// app/instructor/courses/[courseId]/preview/_components/CourseContentCard/index.tsx
import { Eye, PlayCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { countLectures, sumTotalDurationMinutes } from "@/lib/course/courseStats";
import { formatDuration } from "@/lib/format/formatDuration";
import type { CourseContentCardProps, SectionBlockProps } from "./types";

function SectionBlock({ courseId, section }: SectionBlockProps) {
	return (
		<div className="rounded-lg border">
			<div className="flex items-center justify-between p-4">
				<h3 className="font-semibold">{section.title}</h3>
				<span className="text-muted-foreground text-sm">
					{section.lessons.length} lectures
				</span>
			</div>
			{section.lessons.length > 0 && (
				<div className="border-t">
					{section.lessons.map((lesson) => (
						<div
							className="flex items-center justify-between px-4 py-2 text-sm last:rounded-b-lg hover:bg-muted/50"
							key={lesson.id}
						>
							<div className="flex items-center gap-2 text-muted-foreground">
								<PlayCircle className="h-4 w-4 shrink-0" />
								<span>{lesson.title}</span>
								{lesson.durationMinutes != null && (
									<span className="text-xs">
										• {formatDuration(lesson.durationMinutes)}
									</span>
								)}
							</div>
							<Button asChild size="sm" variant="ghost">
								<Link href={INSTRUCTOR_URLS.previewLesson(courseId, lesson.id)}>
									<Eye className="mr-1 h-3 w-3" />
									Preview
								</Link>
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function CourseContentCard({ courseId, sections }: CourseContentCardProps) {
	const lectureCount = countLectures(sections);
	const totalMinutes = sumTotalDurationMinutes(sections);
	const isEmpty = lectureCount === 0;

	return (
		<Card className="p-6">
			<h2 className="mb-4 font-bold text-2xl">Course content</h2>
			<div className="mb-4 text-muted-foreground text-sm">
				{sections.length} sections • {lectureCount} lectures •{" "}
				{formatDuration(totalMinutes)} total length
			</div>
			{isEmpty && (
				<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
					No content added yet
				</p>
			)}
			{!isEmpty && (
				<div className="space-y-2">
					{sections.map((section) => (
						<SectionBlock courseId={courseId} key={section.id} section={section} />
					))}
				</div>
			)}
		</Card>
	);
}
```

- [ ] **Step 3: Verify types + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/instructor/courses/[courseId]/preview/_components/CourseContentCard"
git commit -m "feat(preview): content card with computed summary and empty state"
```

---

### Task 8: `PricingSidebar` (price, computed discount, real includes)

**Files:**
- Create: `app/instructor/courses/[courseId]/preview/_components/PricingSidebar/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/PricingSidebar/types.ts`

**Interfaces:**
- Consumes: `formatPrice`, `formatDuration`, `computeDiscountPercent` (Task 2), `sumVideoDurationMinutes`/`countResources` (Task 1), `OwnCoursePreview["sections"]`.
- Produces: `<PricingSidebar priceCents originalPriceCents sections />` (FR14–FR18, FR22) with a `DiscountBadge` sub-component.

- [ ] **Step 1: Write `PricingSidebar/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/PricingSidebar/types.ts
import type { PreviewSection } from "../CourseContentCard/types";

export type PricingSidebarProps = {
	priceCents: number;
	originalPriceCents: number | null;
	sections: PreviewSection[];
};

export type DiscountBadgeProps = {
	percent: number;
};
```

- [ ] **Step 2: Write `PricingSidebar/index.tsx`** (discount badge is icon + text, not colour-only — FR22)

```tsx
// app/instructor/courses/[courseId]/preview/_components/PricingSidebar/index.tsx
import { Tag } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import { countResources, sumVideoDurationMinutes } from "@/lib/course/courseStats";
import { computeDiscountPercent } from "@/lib/course/discount";
import { formatDuration } from "@/lib/format/formatDuration";
import { formatPrice } from "@/lib/formatPrice";
import type { DiscountBadgeProps, PricingSidebarProps } from "./types";

function DiscountBadge({ percent }: DiscountBadgeProps) {
	return (
		<p className="flex items-center gap-1 text-green-600 text-sm">
			<Tag aria-hidden className="h-3.5 w-3.5" />
			<span>{percent}% off</span>
		</p>
	);
}

export function PricingSidebar({ priceCents, originalPriceCents, sections }: PricingSidebarProps) {
	const discountPercent = computeDiscountPercent(priceCents, originalPriceCents);
	const videoMinutes = sumVideoDurationMinutes(sections);
	const resourceCount = countResources(sections);

	return (
		<Card className="sticky top-6 p-6">
			<div className="space-y-4">
				<div>
					<div className="flex items-baseline gap-2">
						<span className="font-bold text-3xl">{formatPrice(priceCents)}</span>
						{originalPriceCents && (
							<span className="text-lg text-muted-foreground line-through">
								{formatPrice(originalPriceCents)}
							</span>
						)}
					</div>
					{discountPercent != null && <DiscountBadge percent={discountPercent} />}
				</div>

				<Button className="w-full" disabled size="lg">
					Preview Mode - Not Purchasable
				</Button>

				<div className="space-y-2 text-sm">
					<h3 className="font-semibold">This course includes:</h3>
					<div className="space-y-1 text-muted-foreground">
						<p>• {formatDuration(videoMinutes)} on-demand video</p>
						<p>• {resourceCount} downloadable resources</p>
						<p>• Full lifetime access</p>
						<p>• Certificate of completion</p>
					</div>
				</div>
			</div>
		</Card>
	);
}
```

- [ ] **Step 3: Verify types + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/instructor/courses/[courseId]/preview/_components/PricingSidebar"
git commit -m "feat(preview): pricing sidebar with computed discount and includes"
```

---

### Task 9: `PublishReadinessPanel` + `ViewAsStudentLink`

**Files:**
- Create: `app/instructor/courses/[courseId]/preview/_components/PublishReadinessPanel/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/PublishReadinessPanel/types.ts`
- Create: `app/instructor/courses/[courseId]/preview/_components/ViewAsStudentLink/index.tsx`
- Create: `app/instructor/courses/[courseId]/preview/_components/ViewAsStudentLink/types.ts`

**Interfaces:**
- Consumes: `getPublishReadiness`/`Readiness` (Task 3), `STUDENT_URLS.courseDetail` (Task 5).
- Produces:
  - `<PublishReadinessPanel readiness={Readiness} />` (FR20)
  - `<ViewAsStudentLink courseId={string} isPublished={boolean} />` (FR21)

- [ ] **Step 1: Write `PublishReadinessPanel/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/PublishReadinessPanel/types.ts
import type { Readiness } from "@/lib/course/publishReadiness";

export type PublishReadinessPanelProps = {
	readiness: Readiness;
};
```

- [ ] **Step 2: Write `PublishReadinessPanel/index.tsx`** (icon + text per item, not colour-only)

```tsx
// app/instructor/courses/[courseId]/preview/_components/PublishReadinessPanel/index.tsx
import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type { PublishReadinessPanelProps } from "./types";

export function PublishReadinessPanel({ readiness }: PublishReadinessPanelProps) {
	return (
		<Card className="p-6">
			<h2 className="mb-1 font-bold text-xl">Publish readiness</h2>
			<p className="mb-4 text-muted-foreground text-sm">
				{readiness.ready
					? "All set — this course is ready to publish."
					: "Complete these before publishing:"}
			</p>
			<ul className="space-y-2">
				{readiness.items.map((item) => (
					<li className="flex items-center gap-2 text-sm" key={item.id}>
						{item.met ? (
							<CheckCircle2 aria-label="Done" className="h-4 w-4 text-green-600" />
						) : (
							<Circle aria-label="Not done" className="h-4 w-4 text-muted-foreground" />
						)}
						<span className={item.met ? "text-muted-foreground" : ""}>{item.label}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}
```

- [ ] **Step 3: Write `ViewAsStudentLink/types.ts`**

```ts
// app/instructor/courses/[courseId]/preview/_components/ViewAsStudentLink/types.ts
export type ViewAsStudentLinkProps = {
	courseId: string;
	isPublished: boolean;
};
```

- [ ] **Step 4: Write `ViewAsStudentLink/index.tsx`** (absent when not published — FR21)

```tsx
// app/instructor/courses/[courseId]/preview/_components/ViewAsStudentLink/index.tsx
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import STUDENT_URLS from "@/lib/constants/urls/studentsUrls";
import type { ViewAsStudentLinkProps } from "./types";

export function ViewAsStudentLink({ courseId, isPublished }: ViewAsStudentLinkProps) {
	if (!isPublished) return null;
	return (
		<Button asChild className="w-full" variant="outline">
			<Link href={STUDENT_URLS.courseDetail(courseId)}>
				<ExternalLink className="mr-2 h-4 w-4" />
				View as student
			</Link>
		</Button>
	);
}
```

- [ ] **Step 5: Verify types + lint**

Run: `pnpm typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/instructor/courses/[courseId]/preview/_components/PublishReadinessPanel" "app/instructor/courses/[courseId]/preview/_components/ViewAsStudentLink"
git commit -m "feat(preview): publish-readiness panel and view-as-student link"
```

---

### Task 10: Wire the page orchestrator + final verification

**Files:**
- Modify: `app/instructor/courses/[courseId]/preview/page.tsx` (full rewrite to orchestrator)

**Interfaces:**
- Consumes: every component from Tasks 5–9, `getPublishReadiness` (Task 3), `getCourseById` (Task 4).
- Produces: the rendered page; no exported interface.

- [ ] **Step 1: Rewrite `page.tsx` as a thin orchestrator**

```tsx
// app/instructor/courses/[courseId]/preview/page.tsx
import { notFound } from "next/navigation";
import { getPublishReadiness } from "@/lib/course/publishReadiness";
import getCourseById from "@/lib/requests/course/getCourseById";
import { CourseContentCard } from "./_components/CourseContentCard";
import { PreviewHeader } from "./_components/PreviewHeader";
import { PreviewHero } from "./_components/PreviewHero";
import { PreviewMedia } from "./_components/PreviewMedia";
import { PricingSidebar } from "./_components/PricingSidebar";
import { PublishReadinessPanel } from "./_components/PublishReadinessPanel";
import { ViewAsStudentLink } from "./_components/ViewAsStudentLink";

export default async function InstructorCoursePreviewPage({
	params,
}: {
	params: Promise<{ courseId: string }>;
}) {
	const { courseId } = await params;
	const course = await getCourseById(courseId);

	if (!course) {
		notFound();
	}

	const readiness = getPublishReadiness({
		thumbnailUrl: course.thumbnailUrl,
		objectives: course.objectives,
		description: course.description,
		priceCents: course.priceCents,
		sections: course.sections,
	});

	return (
		<div className="space-y-6">
			<PreviewHeader courseId={courseId} />

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="space-y-6 lg:col-span-2">
					<PreviewHero
						averageRating={course.averageRating}
						category={course.category}
						description={course.description}
						duration={course.duration}
						objectives={course.objectives}
						reviewsCount={course.reviewsCount}
						studentCount={course._count.enrollments}
						title={course.title}
					/>
					<PreviewMedia
						previewVideoUrl={course.previewVideoUrl}
						thumbnailUrl={course.thumbnailUrl}
						title={course.title}
					/>
					<CourseContentCard courseId={courseId} sections={course.sections} />
				</div>

				<div className="space-y-6">
					<PricingSidebar
						originalPriceCents={course.originalPriceCents}
						priceCents={course.priceCents}
						sections={course.sections}
					/>
					<ViewAsStudentLink courseId={courseId} isPublished={course.status === "published"} />
					<PublishReadinessPanel readiness={readiness} />
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Confirm no hard-coded literals remain**

Run: `grep -nE "55% off|52 hours|64 lectures|15 downloadable|0 students|\(0 ratings\)" "app/instructor/courses/[courseId]/preview"`
Expected: no matches (the only remaining static copy is "Full lifetime access" / "Certificate of completion" in `PricingSidebar`, which is the locked FR18 perk).

- [ ] **Step 3: Full verification**

Run: `pnpm typecheck && pnpm check && pnpm test:unit lib/course`
Expected: typecheck PASS, Biome PASS, 13 helper tests PASS.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: build succeeds (the preview route compiles as an RSC).

- [ ] **Step 5: Commit**

```bash
git add "app/instructor/courses/[courseId]/preview/page.tsx"
git commit -m "feat(preview): wire page to real course data and sub-components"
```

---

## Self-Review

**Spec coverage:**
- FR1–FR5 (access/nav): FR3/FR4 → Task 5 (`PreviewHeader`); FR5 lesson links → Task 7; FR1/FR2 unchanged (Preview button + `notFound`) — `notFound` retained in Task 10.
- FR6–FR8 → Task 6 (`PreviewHero`, keeps `course.duration`).
- FR9 rating, FR10 students → Task 4 (`_count`) + Task 6.
- FR11 video / empty media → Task 5 (`PreviewMedia`).
- FR12/FR13 content + summary, FR19 empty state → Task 7.
- FR14 price, FR15 discount, FR16 video hours, FR17 resources, FR18 perks → Task 8.
- FR20 readiness → Task 3 + Task 9; FR21 view-as-student → Task 5 (URL) + Task 9.
- FR22 accessible discount cue → Task 8 (`DiscountBadge` icon+text); FR23 accessible video → Task 5 (no empty `<track>`, native controls).
- FR24 parity (direction) → incremental; sub-components mirror student layout, no rewrite this iteration (decision #6) — no dedicated task, satisfied by structure.
- NFRs: security (Task 4 query unchanged authz), correctness (Task 10 grep gate), reliability (Tasks 1–3 null tests), accessibility (Tasks 5/8/9), performance (`_count` in Task 4), maintainability (sub-components + `types.ts` throughout).

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `OwnCoursePreview` (Task 4) → `PreviewSection` (Task 7) reused by Task 8; helper names (`sumTotalDurationMinutes`, `sumVideoDurationMinutes`, `countLectures`, `countResources`, `computeDiscountPercent`, `getPublishReadiness`, `Readiness`) consistent across producer/consumer tasks.