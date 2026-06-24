---
feature: achievements
status: stable
models: []
depends-on: [progress]
---

## Purpose

Students want recognition for their learning activity beyond raw numbers. The progress page
(`/dashboard/progress`) previously showed a hardcoded, fake "earned" achievements list; this gives
each badge a real definition tied to the student's actual enrollment, completion, streak, lesson,
quiz, and review history.

## Functional scope

- `student.getAchievements` (studentProcedure) evaluates every rule in `ACHIEVEMENT_RULES`
  (`server/services/student/achievements.rules.ts`) against the student's current activity, then
  returns only the **visible** subset via `selectVisibleAchievements`. No persistence — achievements
  are computed fresh on every call from existing repositories; there is no `Achievement` table, no
  unlock event, no `unlockedAt` timestamp.
- Metrics evaluated: courses completed, courses enrolled, current day streak, total distinct study
  days, lifetime learning minutes, lessons completed, correct quiz answers, and reviews written.
  Each metric maps to a `group` (e.g. `courses`, `streak`, `quiz`) with multiple ascending-target
  tiers (e.g. courses: 1 → 5 → 10 → 25).
- Each `AchievementView` carries `current` (the student's value, capped at `target`) and `earned`
  (`current value >= target`), so the UI can render a progress bar for badges not yet earned.
- **Progressive disclosure**: within a `group`, `selectVisibleAchievements` returns every earned tier
  plus the single next locked tier (the current goal); further locked tiers stay hidden until
  reached. A brand-new student therefore sees exactly one badge per group (8 total), not all 19.
- `/dashboard/progress` renders the result via the `Achievements` component
  (`app/_components/Dashboard/Progress/Achievements/`): earned badges show lit with their icon;
  unearned badges show dimmed with a `current / target` progress bar. The list area is height-capped
  (`max-h-[22rem] overflow-y-auto`) so an active student's longer list scrolls inside the card instead
  of growing it past its sibling cards.
- The adjacent "Skill Progress" card on the same page is now also real data, backed by a dedicated
  `Skill` taxonomy — see [`../skill-progress/spec.md`](../skill-progress/spec.md).

## Acceptance criteria

- A brand-new student (no enrollments, no completions) sees exactly one badge per group — the
  first tier of each — all unearned at `0 / target`, with no errors.
- A student who has completed exactly N courses, where N equals a tier's target, sees that tier
  marked earned (boundary is inclusive: `current >= target`); the next-higher tier in the same group
  is visible and unearned; tiers beyond that are absent from the response.
- Exceeding a target does not overflow the progress bar — `current` is capped at `target`.
- Each achievement's `earned` flag depends only on its own metric — activity in one group (e.g.
  quiz answers) never marks an achievement in an unrelated group (e.g. course completions) as
  earned.
- A group where every tier is earned shows all of that group's tiers (no extra locked tier is
  appended past the last one).

## Agent notes

- Achievement rules are declarative data (`ACHIEVEMENT_RULES`), not one-off conditionals — adding a
  new badge means adding one entry to that array (with its `group`) plus, if it needs a metric not
  already in `AchievementMetrics`, wiring that metric into `StudentService.getAchievements`.
- `selectVisibleAchievements` assumes rules within a `group` are declared in ascending-target order
  in `ACHIEVEMENT_RULES` — it picks the first unearned tier as the cutoff, so an out-of-order target
  within a group would hide the wrong tiers.
- `evaluateAchievements` and `selectVisibleAchievements` (`achievements.rules.ts`) are pure functions
  with no I/O — all data fetching happens in `StudentService.getAchievements`, which is why the rules
  themselves are trivially unit tested without mocking repositories.
- Streak and total-study-days both derive from the single `lessonProgressRepository.getCompletionDays`
  call already used by `getProgressStats` — don't add a second query for either.