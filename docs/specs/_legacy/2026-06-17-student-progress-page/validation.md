# Validation: Student Progress Page — Real Data

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean (also the guard that no lesson `duration` reference survives the rename; `Course.duration` must remain).
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.
- `pnpm eval courseAI:classifyIntent` + the curriculum extraction eval — AI builder still generates valid curricula with numeric `durationMinutes` (run before merge per CLAUDE.md, since the curriculum schema/prompt changed).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `lib/stats/getWeekWindows`: `now = Wed 2026-06-17 14:30` → `startThisWeek = 2026-06-11 00:00`, `startPriorWeek = 2026-06-04 00:00`.
- `lib/format/formatDuration`: `45 → "45 min"`, `120 → "2h"`, `90 → "1h 30m"`, `0/null/undefined → "—"`.
- `lib/parse/parseLessonDuration`: `"45" → 45`, `"15:30" → 15`, `"10 min" → 10`, `"1h 30m" → 90`, `"1.5 hours" → 90`, `"1 week"/""/null/"soon" → null`.
- `lib/stats/computeDelta` (existing, must still pass after the `StatDelta` relocation): `(110,100) → {percent,10,up}`, `(x,0) → new|none`.
- `StudentService.getProgressStats` (mocked repos, fake time = Wed 2026-06-17):
  - assembles `totalMinutes` straight from the repo, `totalHoursDelta = computeDelta(thisWeek, priorWeek)`, `coursesCompleted.delta = computeDelta(thisMonthNew, lastMonthNew)`.
  - `weeklyActivity` has exactly 7 entries oldest→newest; today's bar carries the day's minutes; a day with no data is `minutes: 0` (chart never drops a day).
  - `avgDailyMinutes = round(weekTotal / 7)`.
  - streak: completion days `[Jun17, Jun16, Jun15, Jun12]` → `3` (gap stops it); empty days → `0`; only-yesterday → counts (boundary).
  - new student (all repos return zeros/empties) → `totalMinutes 0`, `totalHoursDelta {none}`, `currentStreakDays 0`, `avgDailyMinutes 0`, flat 7-day chart.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `lessonProgressRepository.getCompletedMinutesTotals`: seeds completed lessons with `durationMinutes 30 + null` this week and `60` two weeks ago, plus one incomplete `90` → `{ lifetimeMinutes: 90, thisWeekMinutes: 30, priorWeekMinutes: 0 }` (proves `COALESCE` null→0 and that incomplete lessons are ignored).
- `lessonProgressRepository.getDailyCompletedMinutes`: two distinct completion days since the window start → 2 rows, numeric `minutes`.
- `lessonProgressRepository.getCompletionDays`: distinct day-truncated completion dates returned newest-first.
- `enrollmentRepository.getStudentCompletionStats`: 1 completed this month + 1 last month + 1 active (not completed) → `{ total: 2, thisMonthNew: 1, lastMonthNew: 1 }`.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 Total Hours card | `getCompletedMinutesTotals` integration; service unit (`totalMinutes`); manual #1 |
| FR2 Total Hours delta (7d vs prior 7d) | `getWeekWindows` unit; `computeDelta` unit; service unit (`totalHoursDelta`); manual #4 (empty → hidden) |
| FR3 Courses Completed card | `getStudentCompletionStats` integration (`total`); service unit; manual #1 |
| FR4 Courses Completed delta (MoM) | `getStudentCompletionStats` integration (`thisMonthNew`/`lastMonthNew`); service unit (`coursesCompleted.delta`) |
| FR5 Current Streak | `getCompletionDays` integration; service unit (gap / boundary / empty cases); manual #1, #4 |
| FR6 Avg. Daily Time | `getDailyCompletedMinutes` integration; service unit (`avgDailyMinutes`); manual #1 |
| FR7 Weekly Activity chart (7 bars, zero days shown) | `getDailyCompletedMinutes` integration; service unit (`weeklyActivity` length + zero-fill); manual #1, #4 |
| FR8 Single fetch in RSC | code review of `app/dashboard/progress/page.tsx` (one `getProgressStats()` call); manual #1 (one network round-trip) |
| FR9 Authorization (`studentProcedure`, id from session) | router uses `studentProcedure`; manual #5 (non-student blocked); edge cases below |
| FR10 Lesson duration capture (form + editor) | `pnpm typecheck`; manual #2 (create/edit a lesson with minutes) |
| FR11 AI builder numeric duration | `pnpm eval courseAI:*`; manual #3 (AI-built curriculum persists with minutes) |
| FR12 Duration backfill | `parseLessonDuration` unit; manual #6 (run backfill, spot-check Studio) |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d            # local Postgres on 5433
pnpm db:migrate                 # apply the two new migrations
pnpm tsx scripts/backfill-lesson-duration.ts   # backfill legacy durations
pnpm dev
# Have ready: a student account with several completed lessons across multiple days,
# and a fresh student account with no completions.
```

1. **Populated student dashboard:** sign in as the seeded student → open `/dashboard/progress`. Expect: Total Hours equals the summed minutes of their completed lessons (÷60, one decimal); Courses Completed equals their completed enrollments; a 7-bar Weekly Activity chart with the correct per-day hours; a non-zero streak matching their consecutive completion days; Avg. Daily Time = mean of the 7 bars. Values match Prisma Studio.
2. **Instructor sets a numeric duration:** as an instructor, edit a course → curriculum form shows a numeric "Minutes" input; set `15`, save; reopen the lesson editor → it shows `15`; the AI preview/curriculum card renders `15 min` (via `formatDuration`).
3. **AI builder produces minutes:** open the AI Course Builder, generate a curriculum through the `curriculum` step, accept → the persisted lessons have integer `durationMinutes`; no validation error; `pnpm eval courseAI:*` passes.
4. **New student empty state:** sign in as the fresh student → `/dashboard/progress` shows `0` hours, `0` courses, `0 days` streak, `—`/`0` avg daily time, and a flat 7-bar chart (every day present, all zero); no deltas shown; no runtime error.
5. **Authorization:** call `api.student.getProgressStats` as an instructor/admin (or unauthenticated) → request is rejected by `studentProcedure`; the student endpoint never reads an id from input.
6. **Backfill correctness:** before backfill, note a lesson with `duration = "10 min"`; run the script → `durationMinutes = 10`; a lesson with `duration = "1 week"` stays `null`; re-running the script reports `0/0` (idempotent).

## Edge cases & regression

- **Null duration:** a completed lesson with `durationMinutes = null` adds `0` to all sums and never throws (`COALESCE`).
- **Streak boundary:** activity yesterday but not yet today keeps the streak alive; a one-day gap ends it; activity only older than yesterday → streak `0`.
- **Day/timezone bucketing:** daily buckets and the 7-day window keys are compared via the same `yyyy-MM-dd` formatting so a completion shows on its server-local calendar day.
- **IDOR:** `getProgressStats` is scoped to `ctx.session.user.id`; no student can read another student's progress (no id input exists).
- **Migration safety:** between Migration A and B both columns exist, so the app builds at every commit; the backfill is idempotent; abort mid-rollout is safe (numeric column is additive until the drop).
- **Regression — course duration untouched:** `Course.duration` ("6 weeks") still required and displayed; course create/edit and the basic AI step are unaffected.
- **Regression — page degrades:** a tRPC failure makes `getProgressStats` return zeroed stats so the page renders empty-but-valid rather than crashing.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] `courseAI` evals pass with numeric `durationMinutes`.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted (AI builder rename, parse quality, leftover refs, streak off-by-one, dashboard-spec reuse note).
- [ ] Docs updated where warranted — CLAUDE.md schema/key-models note for `Lesson.durationMinutes`, and the paused dashboard spec updated to *reuse* the `student` router/service + `StatDelta` move.