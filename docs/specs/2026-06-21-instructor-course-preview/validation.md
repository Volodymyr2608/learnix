# Validation: Instructor Course Preview Page

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` — green (new helper tests under `lib/course/`).
- `pnpm build` — production build of the preview RSC succeeds.
- `pnpm test:integration` — unchanged; no integration tests added (the only DB change is a
  `_count` aggregate on an existing query, verified via the manual student-count scenario).
- Evals — N/A (no prompt/LLM behaviour changes).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `courseStats.sumTotalDurationMinutes`: sums `durationMinutes` across all lessons, treating `null`
  as 0; `[]` → `0`. (Fixture sums to `105`.)
- `courseStats.sumVideoDurationMinutes`: sums `durationMinutes` only for lessons with a non-empty
  `videoUrl` (empty string and `null` excluded). (Fixture → `30`.)
- `courseStats.countLectures`: total lesson count across sections (fixture → `4`); `[]` → `0`.
- `courseStats.countResources`: sums `resources` array lengths, treating `null`/non-array as `0`
  (fixture → `2`).
- `discount.computeDiscountPercent`: `null` original → `null`; original ≤ price → `null`;
  `4500/9000` → `50`; `6700/10000` → `33` (rounded).
- `publishReadiness.getPublishReadiness`: all-met fixture → `ready: true`; missing thumbnail →
  `thumbnail` item `met: false` and `ready: false`; empty objectives/lessons/description flagged
  individually; `priceCents: 0` → `price` item `met: true` (free is acknowledged).

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- None added. The `getOwnCourse` `_count.enrollments` aggregate is exercised by manual scenario 2.
  (Rationale: it is a single additive Prisma `_count` using an already-proven pattern; the existing
  owning-instructor scoping is unchanged.)

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Preview button) | Manual scenario 1 (reachable from builder); unchanged behaviour |
| FR2 (owning-instructor scope, 404) | Manual scenario 7 (other instructor's course → 404); `getOwnCourse` authz unchanged |
| FR3 (header actions) | Manual scenario 1 (back + Edit links) |
| FR4 (preview banner + disabled CTA) | Manual scenario 1 |
| FR5 (lesson preview links) | Manual scenario 3 |
| FR6 (title/category/description) | Manual scenario 1 |
| FR7 (objectives) | Manual scenario 1 |
| FR8 (hero duration = `course.duration`) | Manual scenario 1 (hero shows authored string) |
| FR9 (real rating) | Manual scenario 2 (rating matches `averageRating`/`reviewsCount`) |
| FR10 (real student count) | Manual scenario 2 (count = enrollments) |
| FR11 (preview video playback) | Manual scenarios 4a/4b/4c (video / thumbnail / empty) |
| FR12 (section list) | Manual scenario 3 |
| FR13 (computed summary line) | `countLectures` + `sumTotalDurationMinutes` unit tests; manual scenario 3 |
| FR14 (price + struck original) | Manual scenario 5 |
| FR15 (computed discount badge) | `computeDiscountPercent` unit tests; manual scenario 5 |
| FR16 (on-demand video hours) | `sumVideoDurationMinutes` unit test; manual scenario 5 |
| FR17 (resource count) | `countResources` unit test; manual scenario 5 |
| FR18 (static perks remain) | Manual scenario 5 (perks present, unchanged) |
| FR19 (content empty state) | Manual scenario 6 |
| FR20 (publish-readiness panel) | `getPublishReadiness` unit tests; manual scenario 8 |
| FR21 (view-as-student link) | Manual scenario 9 (present when published, absent when draft) |
| FR22 (accessible discount cue) | Manual scenario 5 (icon + text, not colour-only) |
| FR23 (accessible video) | Manual scenario 4a (native controls, no empty `<track>`) + edge case |
| FR24 (student-view parity, direction) | Inspection: sub-components mirror student layout; no regression — incremental per decision #6 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d           # local Postgres on 5433
pnpm dev                       # dev server
# Sign in as an INSTRUCTOR who owns at least one course.
# Have ready: one published course with sections/lessons (some with durationMinutes + videoUrl,
# some without), a previewVideoUrl, a thumbnailUrl, originalPriceCents > priceCents, and ≥1
# enrollment; plus one draft course missing a thumbnail and with no lessons.
```

1. **Header, banner, hero text:** Open the course builder → click **Preview**. → Lands on
   `/instructor/courses/<id>/preview`. The back arrow returns to the courses list; **Edit Course**
   opens the editor. The yellow "Preview Mode" banner is shown and the price CTA reads
   "Preview Mode - Not Purchasable" and is disabled. Category badge, title, description, objectives,
   and the hero **duration** all match the values you authored (duration is the free-text
   `course.duration` string).

2. **Real rating & student count:** On the same course, the star rating shows the course's actual
   `averageRating` (one decimal) and `(<reviewsCount> ratings)` — **not** `0`/`(0 ratings)` unless the
   course genuinely has none. The students figure equals the course's enrollment count (verify
   against Prisma Studio `Enrollment` rows for that course). → Both reflect real data.

3. **Content list & summary:** The "Course content" card header reads
   `<N> sections • <M> lectures • <T> total length`, where N/M are the real counts and T is the sum
   of all lesson `durationMinutes` (lessons with null duration contribute 0; if all are null, shows
   `—`). Each lesson row links to that lesson's preview page. → No `64 lectures`/`52h` literals.

4. **Preview media (three branches):**
   - **4a — video set:** With `previewVideoUrl` present, the media card renders a real `<video>`
     with native controls that **plays**. Inspect the DOM: the `<video>` has no `<track>` element
     with an empty `src`. → Plays; accessible markup (FR11/FR23).
   - **4b — thumbnail only:** Clear `previewVideoUrl`, keep `thumbnailUrl`. → The card shows the
     thumbnail image.
   - **4c — neither:** Clear both. → The card shows the "No preview media yet" empty state.

5. **Pricing sidebar:** With `originalPriceCents > priceCents`, the sidebar shows the price with the
   original struck through and a discount badge reading `<P>% off` where P =
   `round((1 - price/original) * 100)` — accompanied by a tag **icon** (meaning is not colour-only,
   FR22). The includes list shows `<video hours> on-demand video` (sum of `durationMinutes` for
   lessons with a `videoUrl`) and `<count> downloadable resources` (sum of lesson resources), plus the
   static "Full lifetime access" and "Certificate of completion". → No `55% off`/`52 hours`/`15`
   literals.

6. **Content empty state:** Preview the draft course that has no lessons. → The content card shows
   "No content added yet" instead of an empty box (FR19).

7. **Ownership boundary:** While signed in as instructor A, navigate directly to the preview URL of a
   course owned by instructor B. → Standard 404 page (`notFound()`), no data leak.

8. **Publish readiness:** Preview the draft course missing a thumbnail and lessons. → The
   "Publish readiness" panel lists unmet items (thumbnail, lessons, etc.) each with a hollow-circle
   icon + label; met items show a check. Preview the fully-complete published course → panel shows
   the "ready to publish" positive state with all checks.

9. **View-as-student link:** On the **published** course preview, a "View as student" button links to
   `/dashboard/browse/<id>`. On the **draft** course preview, the button is **absent** (FR21).

## Edge cases & regression

- **All null durations:** a course whose lessons all have `durationMinutes: null` → summary total and
  "on-demand video" both render `—` (via `formatDuration(0)`), no `NaN`, no throw.
- **No resources anywhere:** `resources` null/empty on every lesson → "0 downloadable resources".
- **`originalPriceCents` equal to or below `priceCents`:** no discount badge rendered (no `0% off` /
  negative percent).
- **Free course (`priceCents: 0`):** price shows "Free"; readiness "price" item is still met.
- **Empty `<track>` regression (FR23):** confirm the preview `<video>` does not reintroduce
  `<track ... src="" />` (the per-lesson page's old pattern); captions track is omitted entirely.
- **Stable keys:** sections/lessons render with `key={section.id}`/`key={lesson.id}` — reordering
  curriculum then re-previewing shows no React key warnings in the console.
- **Authz unchanged:** the `_count` addition does not widen access — `getOwnCourse` still filters by
  `instructorId`; scenario 7 still 404s.

## Definition of done

- [ ] `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm build` all green.
- [ ] All 13 `lib/course/` unit tests pass.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All 9 manual scenarios pass.
- [ ] Edge cases above verified; no console key warnings.
- [ ] No hard-coded data literal remains on the page except the locked FR18 perks (grep gate in
      plan Task 10, Step 2 is clean).
- [ ] Risks in `spec.md` accepted/mitigated (hero-vs-summary divergence is by design per FR8).
- [ ] Docs: CLAUDE.md route-group note unchanged (no architectural shift); spec folder is the record.