# Validation: Student Dashboard — Real Data

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean (also confirms the relocated/existing `StatDelta` import resolves and the new entity types wire end-to-end).
- `pnpm check` — Biome lint + format clean (no unused `Card*`/lucide imports left in `app/dashboard/page.tsx`).
- `pnpm test:unit` and `pnpm test:integration` — green.
- No evals: this feature changes no prompts or LLM behaviour.

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `lib/stats/computeDelta` (existing, must still pass): `(110,100) → {percent,10,up}`, `(current,0) → {new}` when current>0 else `{none}`, equal periods → `{percent,0,flat}`.
- `StudentService.getDashboardStats` (mocked repos):
  - assembles all four cards — `enrolledCourses.total = enrollment.active`, `enrolledCourses.delta = computeDelta(thisMonthNew, lastMonthNew)`; `hoursLearned.totalMinutes = lessons.lifetimeMinutes`, `hoursLearned.delta = computeDelta(thisMonthMinutes, lastMonthMinutes)`; `certificates.total = completion.total`, `certificates.delta = computeDelta(thisMonthNew, lastMonthNew)`.
  - completion rate maths: `completion.total = 4`, `enrollment.total = 8` → `completionRate.percent = 50`; `enrollment.total = 0` → `percent = 0` (no divide-by-zero).
  - new student (all repos return zeros) → every total `0`, every delta `{none}`, `completionRate {percent:0}`.
- `StudentService.getContinueLearning` (mocked repos):
  - resolves the first incomplete lesson per in-progress course, preserving the repo's `lastAccessedAt`-desc order; a course whose first lesson is completed advances to the next (`c1l1` done → next is `c1l2`).
  - drops a course whose every ordered lesson is completed (no `nextLessonId` ⇒ omitted, no broken link).
  - returns `[]` when `findInProgressForContinue` returns `[]` (short-circuits before further queries).

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `enrollmentRepository.getStudentEnrollmentStats`: 2 active (1 enrolled this month, 1 last month) + 1 cancelled (enrolled this month) → `{ active: 2, total: 3, thisMonthNew: 2, lastMonthNew: 1 }` (proves `active` filters by status, `total` is `COUNT(*)`, and `enrolledAt` month bucketing).
- `enrollmentRepository.findInProgressForContinue`: enrollments at progress `50` (recent), `80` (older), `0`, and `100` → returns only the two `0<progress<100` rows, newest `lastAccessedAt` first, capped at the limit, each carrying `{ courseId, courseTitle, progress }`.
- `lessonProgressRepository.getStudentLessonStats`: completed lessons `30 + null` this month, `60` last month, plus one incomplete `90` → `{ lifetimeMinutes: 90, thisMonthMinutes: 30, lastMonthMinutes: 60 }` (proves `COALESCE` null→0, `completedAt` month bucketing, and that incomplete lessons are excluded).
- `lessonRepository.findOrderedLessonIdsByCourseIds`: two sections (order 1 then 0) with lessons → returns lessons ordered by `(Section.order, Lesson.order)`, excludes a soft-deleted lesson, and returns `[]` for an empty course list.
- `enrollmentRepository.getStudentCompletionStats` (existing — reused unchanged for FR5/FR6): already covered by the progress-page integration suite.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 Enrolled Courses card | `getStudentEnrollmentStats` integration (`active`); service unit; manual #1 |
| FR2 Enrolled Courses delta (MoM, New/hidden) | `getStudentEnrollmentStats` integration (`thisMonthNew`/`lastMonthNew`); `computeDelta` unit; service unit; manual #1, #3 |
| FR3 Hours Learned card | `getStudentLessonStats` integration (`lifetimeMinutes`, null→0); service unit (`hoursLearned.totalMinutes`); manual #1 |
| FR4 Hours Learned delta (MoM) | `getStudentLessonStats` integration (`thisMonthMinutes`/`lastMonthMinutes`); service unit (`hoursLearned.delta`) |
| FR5 Certificates card | `getStudentCompletionStats` integration (`total`); service unit (`certificates.total`); manual #1 |
| FR6 Certificates delta (MoM) | `getStudentCompletionStats` integration (`thisMonthNew`/`lastMonthNew`); service unit (`certificates.delta`) |
| FR7 Completion Rate card (no delta, 0% at zero) | service unit (50% and 0% cases); manual #1, #3; code review (static subline, no `DeltaBadge`) |
| FR8 Single fetch in RSC | code review of `app/dashboard/page.tsx` (one `Promise.all`); manual #1 |
| FR9 Authorization (`studentProcedure`, id from session) | router uses `studentProcedure`; manual #4; edge cases below |
| FR10 In-progress list (≤3, 0<progress<100, lastAccessedAt desc) | `findInProgressForContinue` integration; service unit (order preserved); manual #1, #2 |
| FR11 Item content (title, next lesson, progress) | `findOrderedLessonIdsByCourseIds` integration; service unit; manual #2 |
| FR12 Resume deep-link | service unit (`nextLessonId`/`nextLessonTitle`); manual #2 (click → correct lesson) |
| FR13 Empty state | service unit (`[]`); component empty-state branch; manual #3 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d     # local Postgres on 5433
pnpm db:migrate          # no new migration for this feature; ensures schema is current
pnpm dev
# Have ready:
#  - Student A: several enrollments — at least one in progress (0<progress<100) with a
#    partially-completed curriculum, at least one completed (completedAt set), lessons
#    with durationMinutes populated.
#  - Student B: a fresh account with zero enrollments.
```

1. **Populated dashboard (Student A):** sign in → open `/dashboard`. Expect: Enrolled Courses = count of active enrollments; Hours Learned = summed `durationMinutes` of completed lessons ÷60 (one decimal); Certificates = completed-enrollment count; Completion Rate = round(completed ÷ total enrolled)%. Each of the three trend cards shows a `+N%` / `−N%` / `New this month` / no subline per its prior-month data; Completion Rate shows "Across enrolled courses" with no delta. All figures match Prisma Studio (`pnpm db:studio`).
2. **Continue Learning resume (Student A):** the Continue Learning card lists up to 3 in-progress courses, most-recently-accessed first, each showing the course title, the next incomplete lesson title, and the progress %. Click one → lands on `/dashboard/courses/<courseId>/learn/<lessonId>` for exactly that next incomplete lesson. Tab navigation focuses each item (they are links).
3. **New student empty state (Student B):** sign in → `/dashboard` shows `0`, `0`, `0`, `0%`; no deltas rendered on any card; Continue Learning shows "No courses in progress yet…" copy (not an empty list); no runtime error.
4. **Authorization:** call `api.student.getDashboardStats` / `getContinueLearning` as an instructor/admin or unauthenticated → rejected by `studentProcedure`. Confirm neither endpoint accepts a student id from input (id is read from `ctx.session.user.id`).

## Edge cases & regression

- **Zero / no-prior-period deltas:** when last month = 0 and this month > 0 → `New this month`; when both = 0 → delta hidden (`{none}`); equal months → "No change". Verified in `computeDelta` + service unit + manual #1/#3.
- **Stale rollup (progress<100 but all lessons done):** `getContinueLearning` drops the course rather than emitting a link with no target (service unit covers this).
- **Null `durationMinutes`:** contributes 0 to Hours Learned and never throws (`COALESCE`); accepted undercount per requirements.
- **`lastAccessedAt` null:** ordered last in `findInProgressForContinue` (`nulls: "last"`), so a never-opened in-progress course still appears but below recently-accessed ones.
- **Completion-rate denominator:** uses `COUNT(*)` over all the student's enrollments (incl. cancelled), per decision #4/FR7 — documented and consistent, not a bug.
- **IDOR:** both queries scoped to `ctx.session.user.id`; no student can read another student's stats or in-progress list (no id input exists).
- **No `StatDelta` relocation regression:** `StatDelta` already lives in `lib/stats/statDelta.ts`; instructor module re-export and `computeDelta` import are unchanged — `pnpm typecheck` is the guard.
- **Page degrades on failure:** a tRPC error makes `getDashboardStats` return zeroed stats and `getContinueLearning` return `[]`, so the dashboard renders empty-but-valid rather than crashing.
- **Recommendations untouched:** `RecommendedRail` still renders from `getRecommendations()` unchanged.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted (no-next-lesson drop; null `durationMinutes` undercount; completion-rate denominator definition).
- [ ] Docs updated where warranted — CLAUDE.md route-group note that `app/dashboard/page.tsx` is now data-backed via the `student` router (`getDashboardStats` / `getContinueLearning`).