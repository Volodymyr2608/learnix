# Skill Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Tasks are mostly
> independent and ordered so the build stays green between commits.

**Goal:** Replace the hardcoded "Skill Progress" card on `/dashboard/progress` with real,
per-skill completion data driven by a new first-class `Skill` entity that instructors attach to
their courses.

**Architecture:** A curated, platform-owned `Skill` taxonomy (seeded, not user-created) is linked
to courses through a `CourseSkill` many-to-many join. Instructors tag courses with skills via a
multi-select on the course form (mirrors the existing `category`/`level` selects). The student
progress page aggregates the student's enrollments by skill — proficiency `%` is the share of that
skill's enrolled courses the student has completed — through the same request → router → service →
repository chain the achievements feature uses.

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma (pgvector unrelated), Better Auth,
react-hook-form + Zod, Radix UI + Tailwind, Vitest.

**Codebase anchors (verified during planning):**
- `studentRouter` (`server/api/routers/student.ts`) — every query is `studentProcedure.query` →
  `studentService.<method>(ctx.session.user.id)` wrapped in `handleServiceError`. New
  `getSkillProgress` mirrors `getAchievements` exactly.
- `studentService.getAchievements` (`server/services/student/student.service.ts:158`) — fetches raw
  metrics from repositories, maps to a DTO. New `getSkillProgress` mirrors this shape.
- `evaluateAchievements` / `selectVisibleAchievements` (`server/services/student/achievements.rules.ts`)
  — pure, I/O-free, unit-tested without mocking repos. The skill-progress mapping follows the same
  "pure function the service calls" pattern so it is unit-testable.
- `enrollmentRepository.getStudentCompletionStats` (`server/repositories/enrollment.repository.ts:444`)
  — example of a `this.count`-based aggregate; the new `getSkillProgress` uses raw SQL (`$queryRaw`)
  like `lessonProgressRepository.getCompletedMinutesTotals` because it joins across the skill tables.
- `AchievementView` (`server/entities/student/achievements.ts`) — entity DTO shape; `SkillProgressView`
  mirrors it.
- `getAchievements.ts` (`lib/requests/student/getAchievements.ts`) — request helper with `EMPTY`
  fallback and try/catch; `getSkillProgress.ts` mirrors it.
- `Achievements` component (`app/_components/Dashboard/Progress/Achievements/{index,types}.tsx`) —
  sibling component conventions (types in `types.ts`, sub-component for repeated rows, `Progress` bar).
- `ControlledSelect` (`app/_components/_shared/components/Form/ControlledSelect/index.tsx`) — the
  `Controller`-wrapped field pattern the new `ControlledMultiSelect` follows.
- `BasicInformationForm` (`app/_components/Course/components/FormCards/BasicInformationForm/index.tsx`)
  — renders `category`/`level` `ControlledSelect`s; the skills multi-select goes here.
- `useCourseForm` + `getDefaultCourseValues` (`app/_components/Course/hooks/useCourseForm.ts`) — form
  defaults; add `skills`.
- `courseSchema` (`server/entities/course/index.ts:36`) and `CourseDto`
  (`server/entities/course/index.ts:113`, built from `CourseSchema.pick`) — the form schema and the
  tRPC create/update input; both gain a `skills` field. `CourseFullCreateDto`/`CourseFullUpdateDto`
  extend `CourseDto`.
- `courseService.createCourse` / `updateCourse` / `syncSections`
  (`server/services/course/course.service.ts`) — nested-write-in-a-transaction pattern the
  `course_skills` sync mirrors.
- `courseRepository.getOwnCourse` (`server/repositories/course.repository.ts:254`) — edit-mode load;
  add the `courseSkills` include here.
- `courseAdapter` (`lib/adapters/course/courseAdapter.ts`) — maps the loaded course to form defaults;
  add `skills`.
- `seed-admin.ts` (`scripts/seed-admin.ts`) + `seed:admin` (`package.json`) — seed-script and
  npm-script conventions for the new `seed-skills.ts` / `seed:skills`.
- `root.ts` (`server/api/root.ts`) — register the new `skill` router.

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Unit tests are colocated `*.test.ts` (no DB); integration tests are
`*.integration.test.ts` against `learnix_test` (see `.env.test.example`). Services and repositories
export singletons. Prisma CLI commands need `DATABASE_URL` exported from `.env.local` (the bare CLI
doesn't auto-load it); `tsx --env-file` scripts and `pnpm test` load env themselves.

---

## Task 1: Prisma schema — `Skill` + `CourseSkill` ✅ DONE (commit `e3573e9`)

**Files:** Modify `prisma/schema/course.prisma`; generated migration
`prisma/migrations/20260624104345_add_skill_and_course_skill/`.

- [x] Added `Skill { id, name @unique, slug @unique, courseSkills }` and
  `CourseSkill { courseId, skillId, @@id([courseId, skillId]), @@index([skillId]), cascade FKs }`,
  plus `courseSkills CourseSkill[]` back-relation on `Course`.
- [x] `pnpm db:generate --name add_skill_and_course_skill` applied; client + `prisma/zod` regenerated;
  `pnpm typecheck`/`pnpm check` clean.

> Pre-existing failed migration `20260623102443_add_messaging` was stale bookkeeping (live tables
> matched the SQL 1:1); resolved non-destructively with `prisma migrate resolve --applied`.

---

## Task 2: Curated skill list + seed script

**Files:**
- Create: `lib/constants/skills.ts`
- Create: `scripts/seed-skills.ts`
- Modify: `package.json` (`scripts` block)

- [ ] **Step 1: Constant.** Mirror `lib/constants/courseCategories.ts` (`as const` array + derived
  union type). Export `SKILLS` as `{ name, slug }[]` — name/slug map 1:1 onto the `Skill` columns:

```ts
export const SKILLS = [
  { name: "React", slug: "react" },
  { name: "TypeScript", slug: "typescript" },
  { name: "JavaScript", slug: "javascript" },
  { name: "Python", slug: "python" },
  { name: "Node.js", slug: "nodejs" },
  { name: "SQL", slug: "sql" },
  { name: "Data Analysis", slug: "data-analysis" },
  { name: "Machine Learning", slug: "machine-learning" },
  { name: "UI/UX Design", slug: "ui-ux-design" },
  { name: "Graphic Design", slug: "graphic-design" },
  { name: "Digital Marketing", slug: "digital-marketing" },
  { name: "SEO", slug: "seo" },
  { name: "Project Management", slug: "project-management" },
  { name: "Cloud Computing", slug: "cloud-computing" },
  { name: "DevOps", slug: "devops" },
  { name: "Mobile Development", slug: "mobile-development" },
] as const;

export type SkillSlug = (typeof SKILLS)[number]["slug"];
```

- [ ] **Step 2: Seed script.** Mirror `scripts/seed-admin.ts` (imports `db` from `@/server/db`,
  `main()` + `.catch(exit 1).finally(db.$disconnect)`). Idempotent upsert by slug:

```ts
for (const { name, slug } of SKILLS) {
  await db.skill.upsert({ where: { slug }, create: { name, slug }, update: { name } });
}
console.log(`Seeded ${SKILLS.length} skills`);
```

- [ ] **Step 3: npm script.** Add to `package.json` beside `seed:admin`:
  `"seed:skills": "tsx --env-file=.env.local scripts/seed-skills.ts"`.

- [ ] **Step 4: Verify + commit.** `pnpm seed:skills` runs clean; run it twice (idempotent, still 16
  rows: `docker exec learnix-app-db psql -U admin -d learnix -c "SELECT count(*) FROM skills;"`);
  `pnpm typecheck`/`pnpm check` clean. No unit tests (data constant + one-shot script, like
  `seed-admin.ts`). Commit `feat(skill): seed curated skill list`.

---

## Task 3: Skill read-side (repository → service → router)

**Files:**
- Create: `server/repositories/skill.repository.ts`
- Create: `server/services/skill/skill.service.ts`, `server/services/skill/skill.service.errors.ts`
- Create: `server/api/routers/skill.ts`
- Modify: `server/api/root.ts`

- [ ] **Step 1: Repository.** Extend `BaseRepository<"skill", …>` (copy the generic param pattern
  from any existing repo, e.g. `conceptMastery.repository.ts`). Add `listAll()` → `findMany({ orderBy:
  { name: "asc" } })`. Export singleton `skillRepository`.

- [ ] **Step 2: Service.** `skill.service.ts` exposes `list()` → `skillRepository.listAll()`.
  Companion `skill.service.errors.ts` with a `SkillError` typed error (follow an existing
  `*.service.errors.ts`). Export singleton `skillService`.

- [ ] **Step 3: Router.** `skillRouter = createTRPCRouter({ list: protectedProcedure.query(...) })`
  → `skillService.list()` wrapped in `handleServiceError`. `protectedProcedure` (not instructor-only)
  so both the instructor form and any future surface can read it. Register `skill: skillRouter` in
  `server/api/root.ts`.

- [ ] **Step 4: Test + commit.** Integration test `skill.repository.integration.test.ts` or
  `skill.service.integration.test.ts`: seed two skills, assert `list()` returns them name-ascending.
  `pnpm test:integration` green. Commit `feat(skill): add skill read API (repo, service, router)`.

---

## Task 4: Course ↔ Skill write-side (schema field, repo sync, service, adapter)

**Files:**
- Modify: `server/entities/course/index.ts` (`courseSchema`, `CourseDto`)
- Modify: `server/repositories/course.repository.ts` (`setSkills`, `getOwnCourse` include)
- Modify: `server/services/course/course.service.ts` (`createCourse`, `updateCourse`)
- Modify: `lib/adapters/course/courseAdapter.ts`

- [ ] **Step 1: Schema field.** Add `skills: z.array(z.string())` (array of skill IDs) to BOTH
  `courseSchema` (form) and `CourseDto` (tRPC input). Default to `[]` where the schema needs it so
  existing callers/tests don't break. It then flows through `CourseFullCreateDto`/`CourseFullUpdateDto`
  automatically.

- [ ] **Step 2: Repository.** Add `setSkills(courseId, skillIds, tx?)`:
  `deleteMany({ where: { courseId } })` then `createMany({ data: skillIds.map(skillId => ({ courseId,
  skillId })) })` on the `courseSkill` delegate (run inside the caller's transaction, mirroring how
  `syncSections` operates). Add `courseSkills: { include: { skill: true } }` to the `getOwnCourse`
  include.

- [ ] **Step 3: Service.** In `createCourse`, after `courseRepository.create`, call
  `setSkills(created.id, dto.skills ?? [])` inside the existing `transaction`. In `updateCourse`,
  after the course update inside the transaction, call `setSkills(courseId, dto.skills ?? [])`
  (delete-then-insert = sync). Destructure `skills` out of `courseData` so it isn't passed to the
  base `create`/`update` (it's a relation, not a column) — mirror how `sections` is destructured.

- [ ] **Step 4: Adapter.** In `courseAdapter`, map
  `skills: course.courseSkills?.map((cs) => cs.skillId) ?? []` so edit-mode form defaults carry the
  current skill IDs.

- [ ] **Step 5: Test + commit.** Integration test in `course.integration.test.ts`: create a course
  with two skill IDs → assert two `course_skills` rows; update the same course to one skill → assert
  one row remains (sync replaces, doesn't append). `pnpm test:integration` green;
  `pnpm typecheck`/`pnpm check` clean. Commit `feat(skill): persist course skills on create/update`.

> Build note: after this task the create/update path writes skills but the form doesn't send them yet
> (Task 5). `skills` defaults to `[]`, so the build stays green.

---

## Task 5: Instructor course form — skills multi-select

**Files:**
- Create: `app/_components/_shared/components/Form/ControlledMultiSelect/{index.tsx,types.ts}`
- Modify: `app/_components/Course/components/FormCards/BasicInformationForm/index.tsx` (+ its `types.ts` if props change)
- Modify: `app/_components/Course/hooks/useCourseForm.ts` (`getDefaultCourseValues`)

- [ ] **Step 1: `ControlledMultiSelect`.** A `Controller`-wrapped (react-hook-form) toggle-chip
  picker — value is `string[]` (skill IDs). Built from the existing `Badge` + `cn`; clicking a chip
  toggles membership. Follow `ControlledSelect`'s structure (`Field`/`FieldLabel`/`FieldError`). Props
  (`types.ts`): `control`, `name`, `label`, `items: { value: string; label: string }[]`, `id`. No new
  Radix dependency — chips suit a curated finite list.

- [ ] **Step 2: Wire into the form.** In `BasicInformationForm`, fetch options with
  `api.skill.list.useQuery()` (the component is already a client component) mapped to
  `{ value: skill.id, label: skill.name }`, and render `<ControlledMultiSelect name="skills" label="Skills" … />`
  next to the category/level grid. Guard the loading state (render the picker once data is present).

- [ ] **Step 3: Form default.** Add `skills: course?.skills ?? []` to `getDefaultCourseValues`.

- [ ] **Step 4: Verify + commit.** `pnpm typecheck`/`pnpm check` clean; manual: create/edit a course,
  select skills, save, reload edit page → selections persist. Commit
  `feat(skill): add skills multi-select to course form`.

---

## Task 6: Student skill-progress (entity → repository → service → router → request helper)

**Files:**
- Create: `server/entities/student/skillProgress.ts`
- Create: `server/services/student/skillProgress.rules.ts` (pure mapping fn)
- Modify: `server/repositories/enrollment.repository.ts` (`getSkillProgress`)
- Modify: `server/services/student/student.service.ts` (`getSkillProgress`)
- Modify: `server/api/routers/student.ts` (`getSkillProgress`)
- Create: `lib/requests/student/getSkillProgress.ts`

- [ ] **Step 1: Entity.**

```ts
export type SkillProgressView = {
  skillId: string;
  skill: string;   // skill name
  level: number;   // 0–100, % of the student's skill courses completed
  completed: number; // count of completed courses with this skill
};
```

- [ ] **Step 2: Repository aggregate.** `getSkillProgress(studentId)` via `$queryRaw`, joining
  `enrollments → courses (deletedAt IS NULL) → course_skills → skills`, grouped by skill, returning
  `{ skillId, name, enrolled, completed }` where `completed = COUNT(*) FILTER (WHERE e."completedAt"
  IS NOT NULL)` and only skills with `enrolled >= 1`. (Raw SQL mirrors the existing
  `lessonProgressRepository` aggregates; the `<=>`-style cross-table grouping isn't expressible via
  the query builder cleanly.)

- [ ] **Step 3: Pure mapping fn.** `skillProgress.rules.ts` exports
  `toSkillProgressViews(rows): SkillProgressView[]` — `level = Math.round(completed / enrolled * 100)`,
  sorted by `level` desc then `skill` name asc. Pure, no I/O (mirrors `evaluateAchievements`).

- [ ] **Step 4: Service + router + helper.** `studentService.getSkillProgress(studentId)` calls the
  repo then `toSkillProgressViews`. Add `getSkillProgress` `studentProcedure` to `studentRouter`.
  `lib/requests/student/getSkillProgress.ts` mirrors `getAchievements.ts` (`EMPTY = []` fallback).

- [ ] **Step 5: Tests + commit.** Unit test `skillProgress.rules.test.ts` — rounding (1/3 → 33),
  desc-then-name sort, empty input → `[]`. Integration test on `getSkillProgress`: a student with
  mixed completed/in-progress enrollments across two skills returns correct `level`/`completed`.
  `pnpm test` green. Commit `feat(skill): student per-skill progress API`.

---

## Task 7: Student progress page — `SkillProgress` component + wiring

**Files:**
- Create: `app/_components/Dashboard/Progress/SkillProgress/{index.tsx,types.ts}`
- Modify: `app/dashboard/progress/page.tsx`

- [ ] **Step 1: Component.** Extract the existing Skill Progress `Card` JSX into `SkillProgress`
  taking `items: SkillProgressView[]`. Render each row's name, `Progress value={skill.level}`, the
  `{skill.level}%` figure, and the secondary line `{skill.completed} completed`. Add an empty state
  ("Enroll in courses to start building skills") when `items.length === 0`. Types in `types.ts`;
  follow `Achievements` conventions (extracted row sub-component, no inline prop types).

- [ ] **Step 2: Page wiring.** Delete the hardcoded `skillProgress` array and the inline `Card`; add
  `getSkillProgress()` to the existing `Promise.all`; render `<SkillProgress items={skillProgress} />`
  in the same grid slot.

- [ ] **Step 3: Verify + commit.** `pnpm typecheck`/`pnpm check` clean; manual: progress page shows
  real bars sorted desc, correct `N completed`, empty state when no skill-tagged enrollments. Commit
  `feat(skill): real skill progress card on progress page`.

---

## Task 8: Docs (Gate / DoD)

**Files:**
- Create: `docs/specs/features/skill-progress/spec.md` (from `docs/templates/feature-spec.md`)
- Modify: `docs/specs/features/achievements/spec.md` (the "still-hardcoded" Skill Progress note, ~line 36)
- Run: `pnpm spec:sync` (regenerates `docs/specs/features/_index.md`)

- [ ] Write `spec.md`: Purpose / Functional scope / Acceptance criteria / Agent notes;
  frontmatter `status`, `models: [Skill, CourseSkill]`, `depends-on: [progress]`. Capture the locked
  decisions: curated seeded taxonomy, instructor-assigned via course form, proficiency = % of the
  student's skill courses completed, secondary = `N completed`.
- [ ] Update the achievements spec to point at the new feature instead of "still-hardcoded".
- [ ] `pnpm spec:sync`; commit `docs(skill): add skill-progress spec`.

> Tier: **standard** (new behavior from existing patterns; additive, reversible migration — no money,
> auth, or external service). One `spec.md`, **no ADR**.

---

## Task 9: Final verification

- [ ] `pnpm typecheck` && `pnpm check` && `pnpm test` (unit + integration) — all green.
- [ ] `pnpm seed:skills` then run `pnpm dev`: as instructor create/edit a course, tag skills, save,
  reload → persists.
- [ ] As a student with completed + in-progress enrollments across skill-tagged courses, open
  `/dashboard/progress` → Skill Progress bars are real (`completed/enrolled %`), sorted desc, show
  `N completed`; empty state when the student has no skill-tagged enrollments.

---

## Self-review (spec coverage)

| Requirement | Task |
|---|---|
| New `Skill` entity + `Course↔Skill` join | 1 |
| Curated, platform-owned taxonomy (not user-created) | 2 |
| Read API for the form to list skills | 3 |
| Instructors assign skills to courses | 4 (persist) + 5 (UI) |
| Proficiency = % of student's skill courses completed | 6 |
| Secondary line = `N completed` | 6 (data) + 7 (render) |
| Replace hardcoded card on progress page | 7 |
| Standard-tier docs gate | 8 |

**Placeholder scan:** none. **Type consistency:** `SkillProgressView` fields (`skillId`, `skill`,
`level`, `completed`) used identically across Tasks 6–7; `skills: string[]` (IDs) consistent across
Tasks 4–5.