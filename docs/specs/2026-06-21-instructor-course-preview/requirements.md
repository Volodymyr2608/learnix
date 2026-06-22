# Requirements: Instructor Course Preview Page

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: in progress — post-factum documentation + mock-data remediation

Metadata: 2026-06-21 · Volodymyr Pelykh · documents the already-shipped
`/instructor/courses/[courseId]/preview` page and the gaps that remain.

## Problem

The instructor course-preview page (`app/instructor/courses/[courseId]/preview/page.tsx`)
already exists and is reachable from the course builder via the **Preview** button
(`app/_components/Course/components/PreviewButton/index.tsx`). It is framed to the
instructor as *"This is how students will see your course."*

That promise is currently false in several places: the page renders **hard-coded mock
values** instead of the real course data, so an instructor previewing their course sees
numbers that have nothing to do with what they built.

Concrete mock data in the shipped page:

- `preview/page.tsx:78-83` — ratings show literal `0` / `(0 ratings)` and `0 students`,
  ignoring `course.averageRating` / `course.reviewsCount` (which the query already returns)
  and the real enrollment count (which it does not).
- `preview/page.tsx:131` — course-content header is the literal string
  `"{n} sections • 64 lectures • 52h total length"` — the section count is real, but
  `64 lectures` and `52h total length` are hard-coded.
- `preview/page.tsx:194` — discount badge is the literal `"55% off"`, unrelated to the
  actual `priceCents` / `originalPriceCents`.
- `preview/page.tsx:205-206` — "includes" list hard-codes `"52 hours on-demand video"`
  and `"15 downloadable resources"`.
- `preview/page.tsx:92-102` — when `course.previewVideoUrl` is set, the page renders a
  static `Play` icon placeholder; the preview video **never plays** (the per-lesson
  preview page, by contrast, renders a real `<video>` element).

There is no behavioural spec on record for this page; this document captures it
**post factum** and turns each mock-data spot into a verifiable requirement.

## Goal

- An instructor previewing a course sees data that **matches the real course** — counts,
  durations, ratings, students, and discount are all derived from the course, never faked.
- The preview video is actually watchable from the course-level preview.
- The page actively helps the instructor decide whether the course is **ready to publish**,
  and lets them compare against the live student experience.
- Every currently-shipped behaviour of the page is documented so future changes have a baseline.
- The page is left more maintainable and accessible than it was found (sub-components,
  stable keys, no colour-only cues, valid video markup).
- No regression to access control: the page stays scoped to the course's owning instructor.

## Scope decisions (locked)

1. **Remediation + targeted enhancement, not redesign:** keep the existing two-column
   layout and visual language; correct data sourcing, fix the broken video, and make the
   additive improvements below (empty states, publish-readiness panel, view-as-student
   link, accessibility fixes). — rules out re-laying-out the existing hero/content/pricing
   structure.
2. **Single page in scope:** this document covers the **course** preview page
   (`/instructor/courses/[courseId]/preview`) only. The per-lesson preview page
   (`.../lessons/[lessonId]/preview`) is documented here only as a reachable link target,
   not re-specified.
3. **Reuse existing course data:** prefer fields already returned by
   `course.getOwnCourse` (sections, lessons, `averageRating`, `reviewsCount`, prices,
   `previewVideoUrl`); only the **student/enrollment count** may require extending the
   query. — rules out new services where a derived value suffices.
4. **Static marketing copy stays static:** "Full lifetime access" and
   "Certificate of completion" in the includes list are intentional copy, not data, and
   remain hard-coded.
5. **Refactor the page during remediation:** the data fixes are implemented while
   extracting the page into colocated sub-components (per CLAUDE.md conventions), not bolted
   onto the existing monolith. — makes each fixed figure independently testable.
6. **Parity is a direction, delivered incrementally:** where practical, the preview should
   converge on the real student-facing components rather than maintaining a divergent
   bespoke layout — but a wholesale swap to the student component is allowed to land later
   (FR24 captures the intent, not a big-bang rewrite).

## Assumptions & constraints

- `course.getOwnCourse` already returns all `Course` scalar fields plus
  `sections[].lessons[]`; `averageRating` and `reviewsCount` are therefore already present
  and merely unused by the page.
- `lesson.durationMinutes` is nullable; total-length math must tolerate missing values.
- `lesson.resources` is a JSON array; a course resource count is the sum of per-lesson
  resource arrays.
- Student count is the number of enrollments on the course; it is **not** currently
  included in the preview query.
- The page is a Server Component; data is fetched server-side via
  `getCourseById` → `api.course.getOwnCourse`.

## Functional requirements

Status legend: **Delivered** = already true in the shipped page (documented here);
**Planned** = mock data to replace / behaviour to implement.

### Access & navigation

| # | Surface | Status | Behaviour (acceptance criteria) |
|---|---------|--------|---------------------------------|
| FR1 | Preview button | Delivered | The course builder shows a **Preview** button that links to `/instructor/courses/[courseId]/preview`; it renders nothing when no `courseId` exists (unsaved course). |
| FR2 | Page access | Delivered | The page loads the course via `getOwnCourse` (owning-instructor scoped). A course not owned by the current instructor (or non-existent) renders the standard 404 (`notFound()`). |
| FR3 | Header actions | Delivered | The page shows a back link to the courses list and an **Edit Course** link to the editor for this course. |
| FR4 | Preview-mode banner | Delivered | A persistent banner states the page is preview-only and not purchasable; the price CTA is a disabled "Preview Mode - Not Purchasable" button. |
| FR5 | Lesson preview links | Delivered | Each lesson row links to that lesson's preview page (`.../lessons/[lessonId]/preview`). |

### Course hero & overview

| # | Surface | Status | Behaviour (acceptance criteria) |
|---|---------|--------|---------------------------------|
| FR6 | Title / category / description | Delivered | Renders the course's real category badge, title, and description. |
| FR7 | Objectives | Delivered | "What you'll learn" lists the course's real `objectives`. |
| FR8 | Hero duration | Delivered | The hero meta row shows the course's real `duration`. |
| FR9 | Rating | Planned | The rating shows the course's real `averageRating` and `reviewsCount` (currently hard-coded `0` / `(0 ratings)`). Given a course with no reviews, it shows `0` / `(0 ratings)` from real data. |
| FR10 | Student count | Planned | The students figure shows the course's real enrollment count (currently hard-coded `0 students`). Requires the preview query to expose the enrollment count. |
| FR11 | Preview video playback | Planned | When `previewVideoUrl` is set, the page renders a playable video player (not a static placeholder). When only `thumbnailUrl` is set, it shows the thumbnail. When neither is set, it shows an empty-state placeholder. |

### Course content

| # | Surface | Status | Behaviour (acceptance criteria) |
|---|---------|--------|---------------------------------|
| FR12 | Section list | Delivered | Lists every section with its title and its real lecture (lesson) count; lessons render title and, when present, formatted duration. |
| FR13 | Content summary line | Planned | The summary above the section list shows the real section count, the real total lecture count, and the real total length (currently `64 lectures • 52h total length` is hard-coded). Total length sums `durationMinutes` across lessons, ignoring null durations. |
| FR19 | Content empty state | Planned | When the course has no sections (or all sections are empty), the content card shows a clear empty state ("No content added yet") instead of an empty box. Mirrors the per-lesson preview page's empty-state pattern. |

### Pricing sidebar

| # | Surface | Status | Behaviour (acceptance criteria) |
|---|---------|--------|---------------------------------|
| FR14 | Price | Delivered | Shows the real `priceCents`; when `originalPriceCents` is set, shows it struck through. |
| FR15 | Discount badge | Planned | When `originalPriceCents` is set and greater than `priceCents`, shows the **computed** discount percentage; otherwise shows no discount badge (currently hard-coded `55% off`). |
| FR16 | Includes — video hours | Planned | "on-demand video" reflects the real total course video length (currently hard-coded `52 hours`). |
| FR17 | Includes — resources | Planned | "downloadable resources" reflects the real total resource count across lessons (currently hard-coded `15`). |
| FR18 | Includes — static perks | Delivered | "Full lifetime access" and "Certificate of completion" remain as fixed marketing copy (locked decision #4). |

### Publish readiness & navigation

| # | Surface | Status | Behaviour (acceptance criteria) |
|---|---------|--------|---------------------------------|
| FR20 | Publish-readiness panel | Planned | The page shows a readiness panel listing unmet publish prerequisites (e.g. missing thumbnail, no objectives, no sections/lessons, unset price). When all prerequisites are met, the panel shows a positive "ready to publish" state. The list is derived from the real course, never hard-coded. |
| FR21 | View-as-student link | Planned | When the course is published, the page offers a link to the real public course page so the instructor can compare the preview with the live student experience. When the course is not published, the link is absent (or disabled with an explanatory label). |
| FR22 | Accessible discount cue | Planned | The discount indicator (FR15) conveys its meaning by more than colour alone (e.g. an accessible label / icon), so it is perceivable without colour. |
| FR23 | Preview video accessibility | Planned | The playable preview video (FR11) exposes standard native controls and contains no empty/invalid `<track>` element; a captions track is included only when a real caption source exists. |
| FR24 | Student-view parity (direction) | Planned | Where practical, preview sub-components are sourced from (or share implementation with) the real student-facing course components so the "how students will see your course" promise stays true as the student page evolves. Delivered incrementally; full component reuse may land in a later iteration (decision #6). |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Preview data must come only from an owning-instructor-scoped query; no other instructor's course is ever viewable. |
| Correctness | No user-visible figure on the page may be a hard-coded literal except the locked static perks (FR18). |
| Reliability | Derived figures must tolerate empty/partial data (no reviews, null lesson durations, no resources, no preview video) without throwing. |
| Accessibility / UX | The preview video player must expose standard controls and carry no empty/invalid `<track>`; empty states must be clearly labelled; meaningful indicators (e.g. discount) must not rely on colour alone. |
| Performance | Remediation must not introduce N+1 queries; the enrollment count (FR10) should be obtained via aggregation within the existing course fetch. |
| Maintainability | The page is refactored into colocated sub-components (e.g. hero, content list, pricing sidebar, readiness panel), each with prop types in a colocated `types.ts`, no nested ternaries in JSX, and stable React keys (IDs, not titles/text) — per CLAUDE.md component conventions (decision #5). |

## Success metrics

- Zero hard-coded data literals remain on the page (excluding locked static perks) — verifiable by inspection.
- For a seeded course, every figure on the preview page equals the figure derived from that course's records.
- The preview video plays for a course that has a `previewVideoUrl`.

## Out of scope (deferred)

- Wholesale redesign / re-layout of the existing hero, content, and pricing structure
  (additive enhancements in FR19–FR24 are in scope; restructuring those existing blocks is not).
- Re-specifying the per-lesson preview page (`.../lessons/[lessonId]/preview`) beyond
  reusing its empty-state and accessible-video patterns.
- Returning a 403 (vs the current 404) for a course owned by another instructor.
- Live ratings/reviews list on the preview (only the aggregate rating is shown).
- Full big-bang replacement of the preview with the student component (FR24 is incremental
  convergence, not a rewrite this iteration).

## Resolved decisions

- **Duration sourcing (resolves FR16 vs FR13)** — `lesson.durationMinutes` is the single
  instructor-authored figure for **total lesson length**; it is **never** auto-derived from
  the video. Lesson `videoUrl` is a free-text, multi-provider embed (YouTube/Vimeo/…), so its
  length is unknown and **not** fetched. Video is optional supplementary content the instructor
  accounts for when entering the duration. Therefore:
  - **Total length (FR13)** = sum of `durationMinutes` across **all** lessons (null-safe).
  - **On-demand video hours (FR16)** = sum of `durationMinutes` over **only** lessons that
    have a non-empty `videoUrl`.
  - No YouTube/Vimeo API, no new env var, no re-sync hook. (Decided 2026-06-22.)

## Open questions

- **FR8 vs FR13/FR16** — the hero shows the free-text `course.duration` String while the
  content/includes figures are computed from lessons; these can disagree. Should the hero
  also switch to the computed total, or keep the instructor-authored `duration` string?
  Default assumption: keep `course.duration` in the hero, flag if it diverges materially.
- **FR20** — what is the authoritative list of publish prerequisites? Reuse whatever the
  publish/validation path already enforces, or define a preview-specific checklist?