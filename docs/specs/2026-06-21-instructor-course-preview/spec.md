# Spec: Instructor Course Preview Page

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

The preview page (`app/instructor/courses/[courseId]/preview/page.tsx`) is a Server Component
that already fetches the full owned course via `getCourseById → api.course.getOwnCourse`. The work
is **remediation, not redesign** (locked decision #1): every hard-coded figure is replaced with a
value **derived from the already-fetched course**, the broken preview video is made playable, and
the monolithic page is split into colocated sub-components per CLAUDE.md conventions (decision #5).

All derived figures (total length, video hours, lecture count, resource count, discount percent,
publish readiness) are computed by **pure functions in `lib/course/`**, kept null-safe and
unit-tested in isolation — this satisfies the Correctness and Reliability NFRs without touching the
service/repository layers. The **only** data-layer change is exposing the enrollment count (FR10),
which the `getOwnCourse` query lacks; it is added via Prisma `_count` aggregation (no new query, no
N+1). No schema migration and **no ADR** are required — the feature follows existing patterns
(three-layer access, `_count` aggregation already used elsewhere in `course.repository.ts`).

The rejected alternative — fetching real video durations from YouTube/Vimeo — was ruled out in
`requirements.md` (Resolved decisions): `videoUrl` is free-text multi-provider, so `durationMinutes`
stays the single instructor-authored source of truth.

## Architectural decisions referenced

- **No new ADR.** This is documentation + remediation of a shipped page following existing patterns.
- **CLAUDE.md component conventions** — colocated `types.ts` per component; no nested ternaries in
  JSX (early-return sub-components); sub-components for repeated layout; stable React keys (IDs).
- **CLAUDE.md three-layer pattern** — the enrollment-count change flows router → repository
  (`getOwnCourse`); no business logic added to the page.
- **`requirements.md` Resolved decisions (2026-06-22)** — duration sourcing: total length = Σ
  `durationMinutes` over all lessons; video hours = Σ `durationMinutes` over lessons with a
  non-empty `videoUrl`; never auto-fetched.
- **ADR (File uploads, CLAUDE.md)** — `course.previewVideoUrl` is a Vercel Blob upload (≤100MB
  video), so it is a real media URL playable by a native `<video>` element (unlike the per-lesson
  free-text `videoUrl`).

## Data model

**No schema migration.** One query is widened to aggregate the enrollment count.

### `prisma/schema/*` — unchanged

`Lesson.durationMinutes Int?`, `Lesson.videoUrl String?`, `Lesson.resources Json?`,
`Course.previewVideoUrl/thumbnailUrl/priceCents/originalPriceCents/averageRating/reviewsCount/status`
all already exist and are sufficient.

### `server/repositories/course.repository.ts` — modified (`getOwnCourse`)

Add an enrollment aggregate alongside the existing `sections`/`lessons` include (the same
`_count: { select: { enrollments: true } }` pattern already used at lines ~290/369 of this file):

```ts
async getOwnCourse(courseId: string, instructorId: string) {
  return await this.findFirst({
    where: { id: courseId, instructorId },
    include: {
      sections: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
      _count: { select: { enrollments: true } }, // FR10: real student count
    },
  });
}
```

The returned `FullCourse` type (`server/entities/course/index.ts`) is extended so `_count.enrollments`
is typed; the page reads `course._count.enrollments` as the student count.

## API & contracts

No new tRPC procedures or HTTP routes. The existing procedure is unchanged in **signature**; only its
selected fields grow.

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `course.getOwnCourse` | `instructorProcedure` | `courseId: string` → `FullCourse & { _count: { enrollments: number } }` | Owning-instructor scoped (unchanged authz). Adds `_count.enrollments` to the existing payload. No new round-trip. |

All derived figures are computed **client/server-side from this single payload** — no additional
contracts. Pure helpers (see File list) take the already-fetched `sections`/course and return numbers.

## Component / data flow

```
InstructorCoursePreviewPage (RSC)
  └─ getCourseById(courseId) ──► api.course.getOwnCourse  ──► course | null
        │                                                      (owning-instructor scoped)
        ├─ null ─────────────────────────────────────────────► notFound()  (FR2)
        │
        └─ course ─► derive via lib/course/* (pure, null-safe):
              totalDurationMinutes = Σ durationMinutes (all lessons)        ── FR13
              videoDurationMinutes = Σ durationMinutes WHERE videoUrl set   ── FR16
              lectureCount         = Σ lessons                              ── FR13
              resourceCount        = Σ resources[].length                   ── FR17
              discountPercent      = round(1 - price/original) when orig>price ── FR15/FR22
              readiness            = getPublishReadiness(course)            ── FR20
           │
           └─ render sub-components (no business logic in JSX):
                PreviewHeader        — back link, Edit link, preview banner        (FR3/FR4)
                PreviewHero          — category, title, description, objectives,
                                       rating (averageRating/reviewsCount, FR9),
                                       studentCount (_count.enrollments, FR10),
                                       hero duration (course.duration, FR8)
                PreviewMedia         — <video controls> when previewVideoUrl  ─┐    (FR11/FR23)
                                       <Image> when only thumbnailUrl          ├─ early-return branches
                                       empty-state placeholder when neither   ─┘
                CourseContentCard    — summary line (sections·lectures·totalLen),  (FR12/FR13/FR19)
                                       section list, per-lesson rows, empty state
                PricingSidebar       — price + struck original, discount badge,    (FR14–FR18)
                                       includes (videoHours, resourceCount, perks)
                PublishReadinessPanel— unmet prerequisites OR "ready to publish"   (FR20)
                ViewAsStudentLink    — /dashboard/browse/[id] when published       (FR21)
```

Failure/empty branches pinned down:
- **No sections / all empty** → `CourseContentCard` renders a labelled empty state (FR19), summary
  line shows `0 lectures • —`.
- **No `previewVideoUrl` and no `thumbnailUrl`** → `PreviewMedia` shows an empty-state placeholder.
- **No reviews** → rating shows real `0 / (0 ratings)` from `averageRating`/`reviewsCount` (FR9).
- **`originalPriceCents` null or ≤ `priceCents`** → no discount badge (FR15).
- **Not published** → `ViewAsStudentLink` is absent (FR21).

## File list

**New — pure derivation helpers (unit-tested, null-safe):**
- `lib/course/courseStats.ts` — `sumTotalDurationMinutes`, `sumVideoDurationMinutes`,
  `countLectures`, `countResources` over `sections[].lessons[]`. One responsibility: aggregate
  course figures, tolerant of null `durationMinutes` / non-array `resources`.
- `lib/course/courseStats.test.ts` — unit tests (no DB): nulls, empty sections, mixed video/non-video.
- `lib/course/discount.ts` — `computeDiscountPercent(priceCents, originalPriceCents)` → integer % or
  `null` when no valid discount.
- `lib/course/discount.test.ts` — unit tests: null original, original ≤ price, normal case rounding.
- `lib/course/publishReadiness.ts` — `getPublishReadiness(course)` → `{ ready: boolean; items:
  { id; label; met: boolean }[] }`. Preview-specific checklist (thumbnail, objectives, ≥1 lesson,
  price considered, description); pure.
- `lib/course/publishReadiness.test.ts` — unit tests per prerequisite.

**New — colocated preview sub-components** (each folder has `index.tsx` + `types.ts`):
- `app/instructor/courses/[courseId]/preview/_components/PreviewHeader/` — header actions + banner (FR3/FR4).
- `.../preview/_components/PreviewHero/` — title/category/description/objectives/rating/students/duration (FR6–FR10).
- `.../preview/_components/PreviewMedia/` — video / thumbnail / empty-state, early-return branches (FR11/FR23).
- `.../preview/_components/CourseContentCard/` — summary line, section list, lesson rows, empty state (FR12/FR13/FR19).
- `.../preview/_components/PricingSidebar/` — price, discount badge, includes list (FR14–FR18/FR22).
- `.../preview/_components/PublishReadinessPanel/` — readiness checklist (FR20).
- `.../preview/_components/ViewAsStudentLink/` — published-only link to student page (FR21).

**Modified:**
- `app/instructor/courses/[courseId]/preview/page.tsx` — becomes a thin orchestrator: fetch, 404,
  call derivation helpers, compose sub-components. Removes all hard-coded literals except the locked
  static perks (FR18).
- `server/repositories/course.repository.ts` — `getOwnCourse` gains `_count.enrollments` (FR10).
- `server/entities/course/index.ts` — `FullCourse`/`CourseWithRelations` typed to include
  `_count.enrollments`.
- `lib/constants/urls/studentsUrls.ts` — add `courseDetail: (id) => \`${MAIN_URL}/browse/${id}\``
  for the view-as-student link (FR21), reused instead of a string literal.

## Cross-cutting concerns

- **Security / authz:** unchanged — data comes solely from `getOwnCourse` (owning-instructor scoped);
  a non-owned/absent course still `notFound()`s (FR2, NFR). No new endpoint widens exposure.
- **Error handling:** derivation helpers never throw on null/partial data (return `0`/`null`/`—`);
  the page keeps the existing `getCourseById` try/catch → `notFound()` path.
- **Correctness:** no user-visible literal remains except FR18 perks — enforced by moving every
  figure behind a tested pure function.
- **Accessibility (FR22/FR23):** discount conveyed by icon + text label, not colour alone; preview
  `<video>` uses native `controls` and **omits** the `<track>` entirely (no empty `src`), since no
  caption source exists; empty states are text-labelled.
- **Performance (NFR):** enrollment count via `_count` aggregation in the existing fetch — no N+1, no
  extra round-trip. All derivations are O(lessons) in memory.
- **Maintainability:** page decomposed into focused sub-components, each with colocated `types.ts`,
  stable ID keys (replacing the current `key={section.title}` / `key={item}`), no nested ternaries.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Hero `course.duration` (free text) diverges from computed total length, confusing the instructor | M / L | Keep `course.duration` in hero per FR8 default; the computed total appears in the content summary. (Open question — confirm before plan.) |
| `previewVideoUrl` is not actually a playable blob (legacy/external value) for some courses | L / M | `<video controls>` degrades to native "cannot play" UI; thumbnail/empty-state branches cover null. Not a crash. |
| Publish-readiness checklist diverges from a future real publish validator | M / L | Helper is isolated and pure; documented as preview-specific, easy to repoint at a shared validator later (FR20 open question). |
| `_count` typing change ripples to other `getOwnCourse` consumers | L / L | `_count` is additive/optional in the type; existing consumers ignore it. |

## Rollout / migration

- **No env vars, no DB migration, no feature flag.** Pure code change + one widened query.
- **Backfill:** none — figures are derived at render time from existing data.
- **Undo:** revert the page + helpers; the `getOwnCourse` `_count` addition is backward-compatible
  and can stay or be reverted independently.

## Resolved at spec approval

- **FR8 (resolved 2026-06-22)** — the hero keeps the instructor-authored `course.duration` string;
  the computed total length appears only in the content summary line (FR13). The two may differ by
  design.
- **FR20 (accepted default)** — `getPublishReadiness` checks: thumbnail set, ≥1 objective, ≥1 lesson
  across sections, non-empty description, price acknowledged. Preview-specific; may be repointed at a
  shared publish validator later.