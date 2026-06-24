---
feature: skill-progress
status: stable
models: [Skill, CourseSkill]
depends-on: [progress]
---

## Purpose

The progress page (`/dashboard/progress`) previously showed a hardcoded, fake "Skill Progress"
card (the achievements feature's spec explicitly deferred it — see
[`../achievements/spec.md`](../achievements/spec.md) — "it needs its own skill taxonomy"). This
gives students a real, per-skill completion view, and gives instructors a way to tell the platform
which skills their courses teach.

## Functional scope

- `Skill` is a curated, platform-owned taxonomy — a fixed list seeded via `pnpm seed:skills`
  (`lib/constants/skills.ts`, upserted by `slug`). Instructors **pick** from this list; they cannot
  create new skills. This was a deliberate choice over reusing `Course.category` (too coarse, only
  5 values) or `ConceptMastery` (only populated via the AI lesson assistant, sparse/empty for most
  students) — a dedicated, always-populated taxonomy was needed.
- `CourseSkill` is a many-to-many join between `Course` and `Skill`. Instructors tag courses with
  skills via a multi-select (`ControlledMultiSelect`,
  `app/_components/_shared/components/Form/ControlledMultiSelect/`) on the course create/edit form,
  next to `category`/`level`. Selections are read via `skill.list` (`protectedProcedure`) and
  persisted through `courseRepository.setSkills` — a delete-then-insert sync called inside
  `createCourse`'s/`updateCourse`'s existing transactions, the same way `sections` are synced.
- `student.getSkillProgress` (`studentProcedure`) aggregates, per skill, every course the student is
  enrolled in that's tagged with that skill: `enrolled` = count of such enrollments, `completed` =
  count with `Enrollment.completedAt` set. **Proficiency (`level`)** = `round(completed / enrolled *
  100)` — the share of the student's skill-tagged courses they've finished, not raw lesson progress.
  Soft-deleted courses and other students' enrollments are excluded. Skills with zero enrollments
  for the student don't appear.
- Results are sorted by `level` descending, then skill name ascending, and rendered by the
  `SkillProgress` component (`app/_components/Dashboard/Progress/SkillProgress/`) — each row shows
  the skill name, a progress bar at `level`%, and a secondary `"{completed} completed"` line. An
  empty state ("Enroll in courses to start building skills") shows when the student has no
  skill-tagged enrollments at all.

## Acceptance criteria

- A course with no skills selected persists with an empty `course_skills` set; saving it again with
  a different skill selection **replaces** the set (sync, not append) — verified by
  `course.integration.test.ts`'s "replaces skills on update instead of appending" case.
- A student enrolled in 3 courses tagged "React", 1 completed, sees React at `level: 33`,
  `completed: 1` (rounding verified in `skillProgress.rules.test.ts`).
- A student with zero skill-tagged enrollments sees the empty state, not an error or an empty card
  with no message.
- A skill tagged only on courses the student isn't enrolled in, or only on a soft-deleted course,
  never appears in that student's results.
- Instructors can only choose from the seeded `Skill` list — there is no free-text skill entry
  anywhere in the course form.

## Agent notes

- The proficiency metric is deliberately **% of skill-tagged courses completed**, not lesson-level
  progress — a student halfway through every "Python" course shows 0% for Python, not 50%. This
  was an explicit product decision (alternatives considered: avg `Enrollment.progress`) — don't
  "fix" this without confirming the metric choice still holds.
- `enrollmentRepository.getSkillProgress` is raw SQL (`$queryRaw`), like the other
  `lessonProgressRepository`/`enrollmentRepository` aggregates in this codebase — the join across
  `enrollments → courses → course_skills → skills` isn't expressible via Prisma's query builder
  without N+1 queries. `courses.deleted_at` is the DB column name (snake_case, `@map`d); the other
  joined tables use Prisma's default camelCase column names — don't assume one casing convention
  across the whole query.
- `toSkillProgressViews` (`server/services/student/skillProgress.rules.ts`) is a pure, I/O-free
  mapping function the same way `evaluateAchievements` is — all data fetching happens in
  `StudentService.getSkillProgress`, so the rounding/sorting logic is unit-tested without mocking
  repositories.
- `CourseDto`'s `skills` field can't be added via `CourseSchema.pick(...)` like the other fields —
  `skills` isn't a scalar column on the Prisma `Course` model, it's a derived DTO field, so it's
  added via `.extend({ skills: z.array(z.string()).default([]) })` after the `.pick`. Zod's
  `.default()` only applies at actual `.parse()` time (the tRPC boundary) — any hand-built
  `CourseFullCreateDto`/`CourseFullUpdateDto` object literal (e.g. in tests) still needs an explicit
  `skills: [...]`, and `prepareCourseUpdate`'s parameter type must omit `"skills"` alongside
  `"sections"` for the same reason.
- This codebase's `BaseRepository.transaction()` does not thread a real transactional Prisma client
  into nested calls (`this.db` always returns the global client) — `setSkills`'s delete-then-insert
  runs inside `createCourse`/`updateCourse`'s existing `.transaction()` block only by convention,
  matching how `syncSections`/`syncLessons` already work, not because it's truly atomic with the
  rest of the update.