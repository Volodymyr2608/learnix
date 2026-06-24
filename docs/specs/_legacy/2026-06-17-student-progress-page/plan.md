# Student Progress Page — Real Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded student progress page with five real widgets (Total Hours, Courses Completed, Current Streak, Avg. Daily Time, Weekly Activity), backed by a numeric per-lesson duration.

**Architecture:** Migrate `Lesson.duration` (free-text) → `Lesson.durationMinutes` (Int), then derive every metric from completed lessons bucketed by `LessonProgress.completedAt`. A new `student` tRPC router → `StudentService` → aggregation methods on the existing `lessonProgress`/`enrollment` repositories feeds a Server Component via an RSC request wrapper.

**Tech Stack:** Next.js 16 (App Router, RSC), tRPC, Prisma (pgvector unaffected), Postgres, Vitest, date-fns, Biome.

## Global Constraints

- **Layering:** router → service → repository. Aggregation lives in repositories, composition/streak/zero-fill in the service, transport+authz in the router. (CLAUDE.md)
- **Authz:** `student.getProgressStats` uses `studentProcedure`; student id comes from `ctx.session.user.id`, never from input.
- **Only the per-lesson duration changes.** `Course.duration` (course-level, `server/entities/course/index.ts:49`) stays free-text `String` — do not touch it.
- **Components:** colocated `types.ts`; all prop types in `types.ts`; no nested ternaries in JSX; extracted sub-components; flattened loading via sequential boolean guards. (CLAUDE.md)
- **Unknown duration counts as 0:** a lesson with `durationMinutes = null` contributes 0 to all sums (`COALESCE(..., 0)`).
- **Time windows:** calendar days/months in server local time; reuse `getMonthWindows`; add `getWeekWindows` (trailing 7 days).
- **Lint/format:** Biome via `pnpm check:write`; tests via `pnpm test:unit` (no DB) and `pnpm test:integration` (needs `learnix_test`).
- **AI builder:** after the rename, re-run `pnpm eval courseAI:classifyIntent` and the curriculum evals before merge (CLAUDE.md).

---

## Phase 1 — Shared foundations (reusable by the dashboard later)

### Task 1: Relocate `StatDelta` to a neutral module

**Files:**
- Create: `lib/stats/statDelta.ts`
- Modify: `server/entities/instructor/dashboard.ts:1-7`, `lib/stats/computeDelta.ts:1`
- Test: `lib/stats/computeDelta.test.ts` (existing — must still pass)

**Interfaces:**
- Produces: `type StatDelta = { kind: "percent"; value: number; direction: "up" | "down" | "flat" } | { kind: "new" } | { kind: "none" }` from `@/lib/stats/statDelta`.

- [ ] **Step 1: Create the neutral module**

```ts
// lib/stats/statDelta.ts
/** Month-over-month change for a stat card. */
export type StatDelta =
  | { kind: "percent"; value: number; direction: "up" | "down" | "flat" }
  | { kind: "new" } // prior period 0, current > 0
  | { kind: "none" }; // nothing to compare (both periods 0)
```

- [ ] **Step 2: Re-point `computeDelta` import**

In `lib/stats/computeDelta.ts` change the first line:

```ts
import type { StatDelta } from "@/lib/stats/statDelta";
```

- [ ] **Step 3: Re-export from the instructor entity (keep existing importers working)**

Replace the `StatDelta` type declaration block at the top of `server/entities/instructor/dashboard.ts` with a re-export, leaving the rest of the file unchanged:

```ts
export type { StatDelta } from "@/lib/stats/statDelta";
```

- [ ] **Step 4: Typecheck + existing delta tests pass**

Run: `pnpm typecheck && pnpm test:unit lib/stats/computeDelta`
Expected: PASS, no broken imports.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/statDelta.ts lib/stats/computeDelta.ts server/entities/instructor/dashboard.ts
git commit -m "refactor(stats): relocate StatDelta to lib/stats/statDelta"
```

### Task 2: `getWeekWindows` helper (trailing 7-day windows)

**Files:**
- Create: `lib/stats/getWeekWindows.ts`, `lib/stats/getWeekWindows.test.ts`

**Interfaces:**
- Produces: `getWeekWindows(now?: Date): { startThisWeek: Date; startPriorWeek: Date }` where `startThisWeek = startOfDay(now - 6 days)`, `startPriorWeek = startThisWeek - 7 days`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/stats/getWeekWindows.test.ts
import { describe, expect, it } from "vitest";
import { getWeekWindows } from "./getWeekWindows";

describe("getWeekWindows", () => {
  it("returns a 7-day window ending today and the prior 7-day window", () => {
    const now = new Date(2026, 5, 17, 14, 30); // Wed Jun 17 2026, 14:30 local
    const { startThisWeek, startPriorWeek } = getWeekWindows(now);
    expect(startThisWeek).toEqual(new Date(2026, 5, 11, 0, 0, 0, 0)); // Jun 11 00:00
    expect(startPriorWeek).toEqual(new Date(2026, 5, 4, 0, 0, 0, 0)); // Jun 4 00:00
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/stats/getWeekWindows`
Expected: FAIL — cannot find module `./getWeekWindows`.

- [ ] **Step 3: Implement**

```ts
// lib/stats/getWeekWindows.ts
import { startOfDay, subDays } from "date-fns";

export type WeekWindows = {
  startThisWeek: Date; // start of the trailing 7-day window (today - 6 days)
  startPriorWeek: Date; // start of the 7 days before that
};

/** Trailing 7-day boundaries (server local time) for week-over-week deltas. */
export function getWeekWindows(now: Date = new Date()): WeekWindows {
  const startThisWeek = startOfDay(subDays(now, 6));
  return { startThisWeek, startPriorWeek: subDays(startThisWeek, 7) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/stats/getWeekWindows`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stats/getWeekWindows.ts lib/stats/getWeekWindows.test.ts
git commit -m "feat(stats): add getWeekWindows trailing-7-day helper"
```

### Task 3: `formatDuration` helper (minutes → display string)

**Files:**
- Create: `lib/format/formatDuration.ts`, `lib/format/formatDuration.test.ts`

**Interfaces:**
- Produces: `formatDuration(minutes: number | null | undefined): string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/format/formatDuration.test.ts
import { describe, expect, it } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("formats minutes under an hour", () => {
    expect(formatDuration(45)).toBe("45 min");
  });
  it("formats whole hours", () => {
    expect(formatDuration(120)).toBe("2h");
  });
  it("formats hours and minutes", () => {
    expect(formatDuration(90)).toBe("1h 30m");
  });
  it("treats null/unknown/zero as a dash", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/format/formatDuration`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/format/formatDuration.ts
/** Render a minute count as "45 min" | "2h" | "1h 30m"; unknown/zero → "—". */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/format/formatDuration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format/formatDuration.ts lib/format/formatDuration.test.ts
git commit -m "feat(format): add formatDuration helper"
```

### Task 4: `parseLessonDuration` helper (free-text → minutes)

**Files:**
- Create: `lib/parse/parseLessonDuration.ts`, `lib/parse/parseLessonDuration.test.ts`

**Interfaces:**
- Produces: `parseLessonDuration(raw: string | null | undefined): number | null` — minutes, or `null` when unparseable / not lesson-scale.

- [ ] **Step 1: Write the failing test**

```ts
// lib/parse/parseLessonDuration.test.ts
import { describe, expect, it } from "vitest";
import { parseLessonDuration } from "./parseLessonDuration";

describe("parseLessonDuration", () => {
  it("parses a bare number as minutes", () => {
    expect(parseLessonDuration("45")).toBe(45);
  });
  it("parses mm:ss as minutes (floor)", () => {
    expect(parseLessonDuration("15:30")).toBe(15);
  });
  it("parses '10 min' and '10 minutes'", () => {
    expect(parseLessonDuration("10 min")).toBe(10);
    expect(parseLessonDuration("10 minutes")).toBe(10);
  });
  it("parses '1h 30m' and '1.5 hours'", () => {
    expect(parseLessonDuration("1h 30m")).toBe(90);
    expect(parseLessonDuration("1.5 hours")).toBe(90);
  });
  it("returns null for unparseable or non-lesson-scale text", () => {
    expect(parseLessonDuration("1 week")).toBeNull();
    expect(parseLessonDuration("")).toBeNull();
    expect(parseLessonDuration(null)).toBeNull();
    expect(parseLessonDuration("soon")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit lib/parse/parseLessonDuration`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/parse/parseLessonDuration.ts
/** Best-effort parse of legacy free-text lesson durations into minutes.
 *  Returns null when the value cannot be confidently read as a lesson length. */
export function parseLessonDuration(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "") return null;

  // "mm:ss" → minutes (floor)
  const clock = s.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number.parseInt(clock[1], 10);

  // "1h 30m", "1h", "90m", "30 min", "1.5 hours"
  const hoursMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minsMatch = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hoursMatch || minsMatch) {
    const hours = hoursMatch ? Number.parseFloat(hoursMatch[1]) : 0;
    const mins = minsMatch ? Number.parseInt(minsMatch[1], 10) : 0;
    const total = Math.round(hours * 60 + mins);
    return total > 0 ? total : null;
  }

  // bare number → minutes
  const bare = s.match(/^(\d+)$/);
  if (bare) {
    const n = Number.parseInt(bare[1], 10);
    return n > 0 ? n : null;
  }

  // weeks/days and anything else → unknown
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit lib/parse/parseLessonDuration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parse/parseLessonDuration.ts lib/parse/parseLessonDuration.test.ts
git commit -m "feat(parse): add parseLessonDuration for duration backfill"
```

---

## Phase 2 — Schema migration + the duration rename (the risky slice)

### Task 5: Add `durationMinutes` column (additive migration)

**Files:**
- Modify: `prisma/schema/lesson.prisma`

- [ ] **Step 1: Add the numeric column alongside the existing one**

In `prisma/schema/lesson.prisma`, inside `model Lesson`, add below `title`:

```prisma
  durationMinutes Int? @map("duration_minutes")
```

Leave the existing `duration String?` line in place for now (both coexist).

- [ ] **Step 2: Generate the migration and client**

Run: `docker-compose up -d && pnpm db:generate --name add_lesson_duration_minutes`
Expected: a new migration under `prisma/migrations/...add_lesson_duration_minutes`, and the Prisma client + `prisma/zod` regenerate with BOTH `duration` and `durationMinutes` on `Lesson`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (additive change, nothing references `durationMinutes` yet).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema/lesson.prisma prisma/migrations generated/prisma prisma/zod
git commit -m "feat(db): add Lesson.durationMinutes column"
```

### Task 6: Backfill script for existing durations

**Files:**
- Create: `scripts/backfill-lesson-duration.ts`

**Interfaces:**
- Consumes: `parseLessonDuration` (Task 4).

- [ ] **Step 1: Write the backfill script**

```ts
// scripts/backfill-lesson-duration.ts
import { db } from "@/server/db";
import { parseLessonDuration } from "@/lib/parse/parseLessonDuration";

async function main() {
  // Only rows not yet backfilled and with a legacy value to read.
  const lessons = await db.lesson.findMany({
    where: { durationMinutes: null, duration: { not: null } },
    select: { id: true, duration: true },
  });

  let updated = 0;
  for (const lesson of lessons) {
    const minutes = parseLessonDuration(lesson.duration);
    if (minutes === null) continue; // leave null → counts as 0 later
    await db.lesson.update({
      where: { id: lesson.id },
      data: { durationMinutes: minutes },
    });
    updated += 1;
  }
  console.log(`Backfilled ${updated}/${lessons.length} lessons.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
```

> Note: match the import path of the Prisma client to the project (`@/server/db`); confirm by `grep -rn "export const db" server/db.ts`.

- [ ] **Step 2: Run the backfill (idempotent)**

Run: `pnpm tsx scripts/backfill-lesson-duration.ts`
Expected: prints `Backfilled N/M lessons.` with no error. Re-running prints `Backfilled 0/0` (idempotent — only `durationMinutes IS NULL` rows are considered).

- [ ] **Step 3: Spot-check in Prisma Studio**

Run: `pnpm db:studio` → open `Lesson`, confirm `durationMinutes` is populated for rows whose `duration` was parseable.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-lesson-duration.ts
git commit -m "feat(scripts): backfill Lesson.durationMinutes from free-text"
```

### Task 7: Migrate all lesson-duration code references to `durationMinutes`

**Files:**
- Modify: `server/entities/lesson/index.ts:18`
- Modify: `server/entities/course/index.ts:13-20`, `:140-148` (lesson schema + `LessonCreateDto`)
- Modify: `server/services/courseAI/validators/getExtractionSchemaForStep.ts:32-37`
- Modify: `server/services/courseAI/validators/getValidatorForStep.ts:14`
- Modify: `server/services/courseAI/tools/validateCurriculumCoherence.ts:12`
- Modify: `server/services/courseAI/prompts/extractStepDataPrompt.ts:7,44-52`
- Modify: `app/_components/Course/hooks/useCourseForm.ts:33`
- Modify: `app/_components/Course/components/FormCards/CurriculumForm/index.tsx` (default lesson)
- Modify: `app/_components/Course/components/FormCards/CurriculumForm/components/SectionLessonForm/index.tsx:97-128,184`
- Modify: `app/_components/Course/components/Lesson/LessonContentEditor/types.ts:13`
- Modify: `app/_components/Course/components/Lesson/LessonContentEditor/hooks/useLessonForm.ts:11`
- Modify: `app/_components/Course/components/Lesson/LessonContentEditor/hooks/useLessonEditor.ts:30`
- Modify: `app/_components/Course/components/AIChatBuilderDialog/components/Preview/Cards/CurriculumCard/index.tsx:45`

> This whole task is one commit: the build stays green because the `duration` column/types still exist; we are only moving *lesson* usages onto `durationMinutes`. **Do not touch course-level `duration`** (`courseSchema.duration`, `CourseDto.duration`).

- [ ] **Step 1: Entities — lesson DTO**

`server/entities/lesson/index.ts` line 18, replace:

```ts
  durationMinutes: z.number().int().min(0).nullable().optional(),
```

`server/entities/course/index.ts` — in the inner `lessonSchema` (lines ~13-20) replace `duration: z.string().nullable().optional()` with:

```ts
      durationMinutes: z.number().int().min(0).nullable().optional(),
```

In `LessonCreateDto` (the `LessonSchema.pick({...})` around line 140), replace `duration: true` with `durationMinutes: true`. Leave `CourseDto.duration: true` (line ~120) untouched — that is the course field.

- [ ] **Step 2: AI builder — extraction schema, validator, coherence tool, prompt**

`getExtractionSchemaForStep.ts` (curriculum case, lessons array, line ~35) replace:

```ts
                  durationMinutes: z.number().int().optional(),
```

`getValidatorForStep.ts` line 14 (curriculum lesson pick) replace `duration: true` with `durationMinutes: true`.

`validateCurriculumCoherence.ts` line 12 replace:

```ts
    .array(z.object({ title: z.string(), durationMinutes: z.number().int().optional() }))
```

`extractStepDataPrompt.ts`:
- line 7 curriculum template → `... "lessons": [{ "title": "string", "durationMinutes": number }] ...`
- lines ~44-52: change the curriculum guidance to "an OPTIONAL `durationMinutes` as a whole number of minutes (e.g. 15, 90)". Leave the basic-step `"duration": "string"` (course length) unchanged.

- [ ] **Step 3: Curriculum form (numeric input)**

`useCourseForm.ts` line 33 and `CurriculumForm/index.tsx` default lesson: replace `{ title: "", duration: "" }` with `{ title: "", durationMinutes: null }`.

`SectionLessonForm/index.tsx`:
- Replace the `isDurationError` derivation to read `lessonData.durationMinutes?.message`.
- Replace the duration `FormField` register path with `...lessons.${lessonIndex}.durationMinutes`, set `type="number"`, `placeholder="Minutes (e.g., 15)"`, and register with `{ valueAsNumber: true }`.
- Line ~184 `addLesson({ title: "", duration: "" })` → `addLesson({ title: "", durationMinutes: null })`.

```tsx
<FormField
  {...register(
    `sections.${sectionIndex}.lessons.${lessonIndex}.durationMinutes`,
    { valueAsNumber: true },
  )}
  error={isDurationError ? lessonData.durationMinutes?.message : undefined}
  label={null}
  placeholder="Minutes (e.g., 15)"
  type="number"
/>
```

- [ ] **Step 4: Lesson editor**

`LessonContentEditor/types.ts` line 13: `duration: string;` → `durationMinutes: number | null;`.

`useLessonForm.ts` line 11: `duration: initialLesson.duration ?? "",` → `durationMinutes: initialLesson.durationMinutes ?? null,`.

`useLessonEditor.ts` line 30: `duration: form.lessonData.duration || null,` → `durationMinutes: form.lessonData.durationMinutes ?? null,`.

- [ ] **Step 5: AI preview card display**

`CurriculumCard/index.tsx` line 45: `{lesson.duration}` → `{formatDuration(lesson.durationMinutes)}` and add `import { formatDuration } from "@/lib/format/formatDuration";`.

- [ ] **Step 6: Typecheck + format**

Run: `pnpm typecheck && pnpm check:write`
Expected: PASS. (If a reference to lesson `duration` was missed, typecheck names the file:line — fix it. `Course.duration` references must remain.)

- [ ] **Step 7: Unit tests for entities (optional but recommended) + run unit suite**

Run: `pnpm test:unit`
Expected: PASS (no test references the removed lesson field).

- [ ] **Step 8: Re-run the AI builder evals**

Run: `pnpm eval courseAI:classifyIntent` and the curriculum extraction eval.
Expected: generation still produces valid curricula with numeric `durationMinutes`.

- [ ] **Step 9: Commit**

```bash
git add server/entities app/_components server/services/courseAI
git commit -m "refactor: move lesson duration to numeric durationMinutes"
```

### Task 8: Drop the legacy `duration` column

**Files:**
- Modify: `prisma/schema/lesson.prisma`

- [ ] **Step 1: Remove the legacy field**

In `prisma/schema/lesson.prisma`, delete the `duration String?` line from `model Lesson`.

- [ ] **Step 2: Generate the drop migration + client**

Run: `pnpm db:generate --name drop_lesson_duration_freetext`
Expected: migration drops `lessons.duration`; Prisma client + `prisma/zod` regenerate without it.

- [ ] **Step 3: Typecheck (guard for stragglers)**

Run: `pnpm typecheck`
Expected: PASS. Any remaining lesson `duration` reference now fails here — fix it. (`Course.duration` is unaffected.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema/lesson.prisma prisma/migrations generated/prisma prisma/zod
git commit -m "feat(db): drop legacy free-text Lesson.duration"
```

---

## Phase 3 — Backend aggregation

### Task 9: `lessonProgressRepository.getCompletedMinutesTotals`

**Files:**
- Modify: `server/repositories/lessonProgress.repository.ts`
- Test: `server/repositories/lessonProgress.repository.integration.test.ts` (create if absent)

**Interfaces:**
- Consumes: `getWeekWindows` (Task 2).
- Produces: `getCompletedMinutesTotals(studentId: string): Promise<{ lifetimeMinutes: number; thisWeekMinutes: number; priorWeekMinutes: number }>`.

- [ ] **Step 1: Write the failing integration test**

```ts
// server/repositories/lessonProgress.repository.integration.test.ts
import { describe, expect, it } from "vitest";
import { lessonProgressRepository } from "./lessonProgress.repository";
// Reuse the existing integration seed helpers used by enrollment.repository.integration.test.ts.

describe("lessonProgressRepository.getCompletedMinutesTotals (integration)", () => {
  it("sums durationMinutes over completed lessons with COALESCE for nulls", async () => {
    // seed: student with 2 completed lessons (durationMinutes 30 + null) this week,
    // 1 completed lesson (60) two weeks ago; one incomplete lesson (90) must be ignored.
    const { studentId } = await seedCompletedLessons();
    const totals = await lessonProgressRepository.getCompletedMinutesTotals(studentId);
    expect(totals.lifetimeMinutes).toBe(90); // 30 + 0(null) + 60
    expect(totals.thisWeekMinutes).toBe(30);
    expect(totals.priorWeekMinutes).toBe(0);
  });
});
```

> Follow the seed/teardown style already in `enrollment.repository.integration.test.ts`; add a `seedCompletedLessons()` helper there or inline.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:integration lessonProgress.repository`
Expected: FAIL — `getCompletedMinutesTotals is not a function`.

- [ ] **Step 3: Implement the method**

Add to `LessonProgressRepository`, and add `import { getWeekWindows } from "@/lib/stats/getWeekWindows";` at the top:

```ts
  async getCompletedMinutesTotals(studentId: string): Promise<{
    lifetimeMinutes: number;
    thisWeekMinutes: number;
    priorWeekMinutes: number;
  }> {
    const { startThisWeek, startPriorWeek } = getWeekWindows();
    const rows = await this.db.$queryRaw<
      [{ lifetime: number; this_week: number; prior_week: number }]
    >`
      SELECT
        COALESCE(SUM(l.duration_minutes), 0)::int AS lifetime,
        COALESCE(SUM(l.duration_minutes) FILTER (
          WHERE lp."completedAt" >= ${startThisWeek}), 0)::int AS this_week,
        COALESCE(SUM(l.duration_minutes) FILTER (
          WHERE lp."completedAt" >= ${startPriorWeek}
            AND lp."completedAt" < ${startThisWeek}), 0)::int AS prior_week
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp."lessonId"
      WHERE lp."studentId" = ${studentId} AND lp."isCompleted" = true
    `;
    const r = rows[0];
    return {
      lifetimeMinutes: Number(r?.lifetime ?? 0),
      thisWeekMinutes: Number(r?.this_week ?? 0),
      priorWeekMinutes: Number(r?.prior_week ?? 0),
    };
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:integration lessonProgress.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/lessonProgress.repository.ts server/repositories/lessonProgress.repository.integration.test.ts
git commit -m "feat(repo): lessonProgress.getCompletedMinutesTotals"
```

### Task 10: `lessonProgressRepository.getDailyCompletedMinutes`

**Files:**
- Modify: `server/repositories/lessonProgress.repository.ts`
- Test: `server/repositories/lessonProgress.repository.integration.test.ts`

**Interfaces:**
- Produces: `getDailyCompletedMinutes(studentId: string, since: Date): Promise<{ day: Date; minutes: number }[]>`.

- [ ] **Step 1: Write the failing test**

```ts
it("buckets completed minutes by calendar day since a date", async () => {
  const { studentId, since } = await seedDailyCompletions(); // two days with completions
  const rows = await lessonProgressRepository.getDailyCompletedMinutes(studentId, since);
  expect(rows.length).toBe(2);
  expect(rows.every((r) => typeof r.minutes === "number")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:integration lessonProgress.repository`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

```ts
  async getDailyCompletedMinutes(
    studentId: string,
    since: Date,
  ): Promise<{ day: Date; minutes: number }[]> {
    const rows = await this.db.$queryRaw<{ day: Date; minutes: number }[]>`
      SELECT date_trunc('day', lp."completedAt") AS day,
             COALESCE(SUM(l.duration_minutes), 0)::int AS minutes
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp."lessonId"
      WHERE lp."studentId" = ${studentId}
        AND lp."isCompleted" = true
        AND lp."completedAt" >= ${since}
      GROUP BY 1
    `;
    return rows.map((r) => ({ day: r.day, minutes: Number(r.minutes) }));
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:integration lessonProgress.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/lessonProgress.repository.ts server/repositories/lessonProgress.repository.integration.test.ts
git commit -m "feat(repo): lessonProgress.getDailyCompletedMinutes"
```

### Task 11: `lessonProgressRepository.getCompletionDays`

**Files:**
- Modify: `server/repositories/lessonProgress.repository.ts`
- Test: `server/repositories/lessonProgress.repository.integration.test.ts`

**Interfaces:**
- Produces: `getCompletionDays(studentId: string): Promise<Date[]>` — distinct day-truncated completion dates, descending.

- [ ] **Step 1: Write the failing test**

```ts
it("returns distinct completion days, newest first", async () => {
  const { studentId } = await seedTwoCompletionDays();
  const days = await lessonProgressRepository.getCompletionDays(studentId);
  expect(days.length).toBe(2);
  expect(days[0].getTime()).toBeGreaterThan(days[1].getTime());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:integration lessonProgress.repository`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

```ts
  async getCompletionDays(studentId: string): Promise<Date[]> {
    const rows = await this.db.$queryRaw<{ day: Date }[]>`
      SELECT DISTINCT date_trunc('day', lp."completedAt") AS day
      FROM lesson_progress lp
      WHERE lp."studentId" = ${studentId}
        AND lp."isCompleted" = true
        AND lp."completedAt" IS NOT NULL
      ORDER BY day DESC
    `;
    return rows.map((r) => r.day);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:integration lessonProgress.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/lessonProgress.repository.ts server/repositories/lessonProgress.repository.integration.test.ts
git commit -m "feat(repo): lessonProgress.getCompletionDays"
```

### Task 12: `enrollmentRepository.getStudentCompletionStats`

**Files:**
- Modify: `server/repositories/enrollment.repository.ts`
- Test: `server/repositories/enrollment.repository.integration.test.ts`

**Interfaces:**
- Consumes: `getMonthWindows` (already imported in this file).
- Produces: `getStudentCompletionStats(studentId: string): Promise<{ total: number; thisMonthNew: number; lastMonthNew: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
it("counts completed enrollments lifetime and by month", async () => {
  const { studentId } = await seedCompletedEnrollments(); // 1 this month, 1 last month, 1 active(not completed)
  const stats = await enrollmentRepository.getStudentCompletionStats(studentId);
  expect(stats.total).toBe(2);
  expect(stats.thisMonthNew).toBe(1);
  expect(stats.lastMonthNew).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:integration enrollment.repository`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement**

```ts
  async getStudentCompletionStats(studentId: string): Promise<{
    total: number;
    thisMonthNew: number;
    lastMonthNew: number;
  }> {
    const { startThisMonth, startLastMonth, startNextMonth } = getMonthWindows();
    const [total, thisMonthNew, lastMonthNew] = await Promise.all([
      this.count({ studentId, completedAt: { not: null } }),
      this.count({
        studentId,
        completedAt: { gte: startThisMonth, lt: startNextMonth },
      }),
      this.count({
        studentId,
        completedAt: { gte: startLastMonth, lt: startThisMonth },
      }),
    ]);
    return { total, thisMonthNew, lastMonthNew };
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:integration enrollment.repository`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/enrollment.repository.ts server/repositories/enrollment.repository.integration.test.ts
git commit -m "feat(repo): enrollment.getStudentCompletionStats"
```

### Task 13: Progress entity types

**Files:**
- Create: `server/entities/student/progress.ts`

**Interfaces:**
- Produces: `WeeklyActivityDay`, `StudentProgressStats` (see code).

- [ ] **Step 1: Create the types**

```ts
// server/entities/student/progress.ts
import type { StatDelta } from "@/lib/stats/statDelta";

/** One day in the trailing-7-day Weekly Activity chart (FR7). */
export type WeeklyActivityDay = {
  date: string; // yyyy-MM-dd (server local)
  weekday: string; // "Mon".."Sun"
  minutes: number; // total duration of lessons completed that day (0 if none)
};

/** Everything the progress page renders (FR1–FR7). */
export type StudentProgressStats = {
  totalMinutes: number; // lifetime; UI formats to hours (FR1)
  totalHoursDelta: StatDelta; // trailing 7d vs prior 7d (FR2)
  coursesCompleted: { total: number; delta: StatDelta }; // FR3/FR4
  currentStreakDays: number; // FR5
  avgDailyMinutes: number; // mean of weeklyActivity minutes (FR6)
  weeklyActivity: WeeklyActivityDay[]; // exactly 7 entries, oldest→newest (FR7)
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/entities/student/progress.ts
git commit -m "feat(entities): StudentProgressStats types"
```

### Task 14: `StudentService.getProgressStats` (composition, streak, zero-fill)

**Files:**
- Create: `server/services/student/student.service.ts`, `server/services/student/student.service.test.ts`

**Interfaces:**
- Consumes: the four repo methods (Tasks 9–12), `computeDelta`, `getWeekWindows`.
- Produces: `studentService.getProgressStats(studentId: string): Promise<StudentProgressStats>`.

- [ ] **Step 1: Write the failing unit test (mocked repos)**

```ts
// server/services/student/student.service.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLessonProgressRepo = {
  getCompletedMinutesTotals: vi.fn(),
  getDailyCompletedMinutes: vi.fn(),
  getCompletionDays: vi.fn(),
};
const mockEnrollmentRepo = {
  getStudentCompletionStats: vi.fn(),
};

vi.mock("@/server/repositories/lessonProgress.repository", () => ({
  lessonProgressRepository: mockLessonProgressRepo,
}));
vi.mock("@/server/repositories/enrollment.repository", () => ({
  enrollmentRepository: mockEnrollmentRepo,
}));

const { studentService } = await import("./student.service");
const STUDENT_ID = "student-1";

describe("StudentService.getProgressStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 12, 0, 0)); // Wed Jun 17 2026
  });

  it("assembles totals, deltas, a 7-day zero-filled chart, avg, and streak", async () => {
    mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
      lifetimeMinutes: 9390, // 156.5h
      thisWeekMinutes: 200,
      priorWeekMinutes: 100,
    });
    mockLessonProgressRepo.getDailyCompletedMinutes.mockResolvedValue([
      { day: new Date(2026, 5, 16), minutes: 120 }, // Tue
      { day: new Date(2026, 5, 17), minutes: 80 }, // Wed (today)
    ]);
    mockLessonProgressRepo.getCompletionDays.mockResolvedValue([
      new Date(2026, 5, 17),
      new Date(2026, 5, 16),
      new Date(2026, 5, 15),
      new Date(2026, 5, 12), // gap → streak stops at 3
    ]);
    mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
      total: 8,
      thisMonthNew: 2,
      lastMonthNew: 0,
    });

    const r = await studentService.getProgressStats(STUDENT_ID);

    expect(r.totalMinutes).toBe(9390);
    expect(r.totalHoursDelta).toEqual({ kind: "percent", value: 100, direction: "up" });
    expect(r.coursesCompleted).toEqual({ total: 8, delta: { kind: "new" } });
    expect(r.weeklyActivity).toHaveLength(7);
    expect(r.weeklyActivity[6]).toEqual({ date: "2026-06-17", weekday: "Wed", minutes: 80 });
    expect(r.weeklyActivity[0].minutes).toBe(0); // Jun 11, no data
    expect(r.avgDailyMinutes).toBe(Math.round(200 / 7));
    expect(r.currentStreakDays).toBe(3);
  });

  it("returns zeroed values and a flat chart for a new student", async () => {
    mockLessonProgressRepo.getCompletedMinutesTotals.mockResolvedValue({
      lifetimeMinutes: 0, thisWeekMinutes: 0, priorWeekMinutes: 0,
    });
    mockLessonProgressRepo.getDailyCompletedMinutes.mockResolvedValue([]);
    mockLessonProgressRepo.getCompletionDays.mockResolvedValue([]);
    mockEnrollmentRepo.getStudentCompletionStats.mockResolvedValue({
      total: 0, thisMonthNew: 0, lastMonthNew: 0,
    });

    const r = await studentService.getProgressStats(STUDENT_ID);
    expect(r.totalMinutes).toBe(0);
    expect(r.totalHoursDelta).toEqual({ kind: "none" });
    expect(r.currentStreakDays).toBe(0);
    expect(r.avgDailyMinutes).toBe(0);
    expect(r.weeklyActivity.every((d) => d.minutes === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:unit server/services/student`
Expected: FAIL — cannot find `./student.service`.

- [ ] **Step 3: Implement the service**

```ts
// server/services/student/student.service.ts
import { addDays, format, isEqual, startOfDay, subDays } from "date-fns";
import { computeDelta } from "@/lib/stats/computeDelta";
import { getWeekWindows } from "@/lib/stats/getWeekWindows";
import type { StudentProgressStats, WeeklyActivityDay } from "@/server/entities/student/progress";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { lessonProgressRepository } from "@/server/repositories/lessonProgress.repository";
import { logger } from "@/server/utils/logger";

const WEEK_DAYS = 7;

class StudentService {
  async getProgressStats(studentId: string): Promise<StudentProgressStats> {
    logger.info("Getting student progress stats", { studentId });
    const { startThisWeek } = getWeekWindows();

    const [totals, daily, completionDays, completion] = await Promise.all([
      lessonProgressRepository.getCompletedMinutesTotals(studentId),
      lessonProgressRepository.getDailyCompletedMinutes(studentId, startThisWeek),
      lessonProgressRepository.getCompletionDays(studentId),
      enrollmentRepository.getStudentCompletionStats(studentId),
    ]);

    const weeklyActivity = this.buildWeek(startThisWeek, daily);
    const weekTotal = weeklyActivity.reduce((sum, d) => sum + d.minutes, 0);

    return {
      totalMinutes: totals.lifetimeMinutes,
      totalHoursDelta: computeDelta(totals.thisWeekMinutes, totals.priorWeekMinutes),
      coursesCompleted: {
        total: completion.total,
        delta: computeDelta(completion.thisMonthNew, completion.lastMonthNew),
      },
      currentStreakDays: this.computeStreak(completionDays),
      avgDailyMinutes: Math.round(weekTotal / WEEK_DAYS),
      weeklyActivity,
    };
  }

  private buildWeek(
    startThisWeek: Date,
    daily: { day: Date; minutes: number }[],
  ): WeeklyActivityDay[] {
    const byKey = new Map(
      daily.map((d) => [format(startOfDay(d.day), "yyyy-MM-dd"), d.minutes]),
    );
    const days: WeeklyActivityDay[] = [];
    for (let i = 0; i < WEEK_DAYS; i++) {
      const day = addDays(startThisWeek, i);
      const key = format(day, "yyyy-MM-dd");
      days.push({ date: key, weekday: format(day, "EEE"), minutes: byKey.get(key) ?? 0 });
    }
    return days;
  }

  private computeStreak(completionDays: Date[]): number {
    if (completionDays.length === 0) return 0;
    const days = completionDays.map((d) => startOfDay(d));
    const today = startOfDay(new Date());
    const yesterday = subDays(today, 1);

    let cursor: Date;
    if (isEqual(days[0], today)) cursor = today;
    else if (isEqual(days[0], yesterday)) cursor = yesterday;
    else return 0;

    let streak = 0;
    for (const day of days) {
      if (isEqual(day, cursor)) {
        streak += 1;
        cursor = subDays(cursor, 1);
      } else if (day < cursor) {
        break;
      }
    }
    return streak;
  }
}

export const studentService = new StudentService();
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:unit server/services/student`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add server/services/student/student.service.ts server/services/student/student.service.test.ts
git commit -m "feat(service): StudentService.getProgressStats"
```

### Task 15: `student` tRPC router + register

**Files:**
- Create: `server/api/routers/student.ts`
- Modify: `server/api/root.ts`

**Interfaces:**
- Produces: `api.student.getProgressStats` (`studentProcedure`, no input).

- [ ] **Step 1: Create the router**

```ts
// server/api/routers/student.ts
import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { studentService } from "@/server/services/student/student.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const studentRouter = createTRPCRouter({
  getProgressStats: studentProcedure.query(async ({ ctx }) => {
    try {
      return await studentService.getProgressStats(ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),
});
```

- [ ] **Step 2: Register in root**

In `server/api/root.ts` add the import and the entry:

```ts
import { studentRouter } from "@/server/api/routers/student";
// …
export const appRouter = createTRPCRouter({
  // …existing…
  student: studentRouter,
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `api.student.getProgressStats` is now typed.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/student.ts server/api/root.ts
git commit -m "feat(api): student router with getProgressStats"
```

### Task 16: RSC request wrapper

**Files:**
- Create: `lib/requests/student/getProgressStats.ts`

**Interfaces:**
- Consumes: `api.student.getProgressStats`.
- Produces: `getProgressStats(): Promise<StudentProgressStats>` (degrades to EMPTY on error).

- [ ] **Step 1: Implement**

```ts
// lib/requests/student/getProgressStats.ts
import type { StudentProgressStats } from "@/server/entities/student/progress";
import { api } from "@/trpc/server";

const EMPTY: StudentProgressStats = {
  totalMinutes: 0,
  totalHoursDelta: { kind: "none" },
  coursesCompleted: { total: 0, delta: { kind: "none" } },
  currentStreakDays: 0,
  avgDailyMinutes: 0,
  weeklyActivity: [],
};

const getProgressStats = async (): Promise<StudentProgressStats> => {
  try {
    return await api.student.getProgressStats();
  } catch (error) {
    console.error("Error fetching student progress stats:", error);
    return EMPTY;
  }
};

export default getProgressStats;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/requests/student/getProgressStats.ts
git commit -m "feat(requests): student getProgressStats RSC wrapper"
```

---

## Phase 4 — UI

### Task 17: `ProgressStatsCards` component

**Files:**
- Create: `app/_components/Dashboard/Progress/ProgressStatsCards/index.tsx`, `.../types.ts`

**Interfaces:**
- Consumes: `StudentProgressStats`, `StatDelta`, `formatDuration`.

- [ ] **Step 1: Types**

```ts
// app/_components/Dashboard/Progress/ProgressStatsCards/types.ts
import type { ReactNode } from "react";
import type { StatDelta } from "@/lib/stats/statDelta";
import type { StudentProgressStats } from "@/server/entities/student/progress";

export type ProgressStatsCardsProps = { stats: StudentProgressStats };

export type StatCardProps = {
  label: string;
  value: string;
  icon: ReactNode;
  subline: ReactNode;
};

export type DeltaBadgeProps = { delta: StatDelta };
```

- [ ] **Step 2: Component (early-return DeltaBadge, no nested ternaries)**

```tsx
// app/_components/Dashboard/Progress/ProgressStatsCards/index.tsx
import { Award, Calendar, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/_components/_shared/ui/card";
import { formatDuration } from "@/lib/format/formatDuration";
import type { DeltaBadgeProps, ProgressStatsCardsProps, StatCardProps } from "./types";

function DeltaBadge({ delta }: DeltaBadgeProps) {
  if (delta.kind === "none") return null;
  if (delta.kind === "new") return <p className="text-muted-foreground text-xs">New this week</p>;
  if (delta.direction === "flat")
    return <p className="text-muted-foreground text-xs">No change</p>;
  const sign = delta.direction === "up" ? "+" : "−";
  return <p className="text-muted-foreground text-xs">{sign}{Math.abs(delta.value)}% this week</p>;
}

function StatCard({ label, value, icon, subline }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">{value}</div>
        {subline}
      </CardContent>
    </Card>
  );
}

function hours(minutes: number): string {
  return (Math.round((minutes / 60) * 10) / 10).toString();
}

export default function ProgressStatsCards({ stats }: ProgressStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        label="Total Hours"
        subline={<DeltaBadge delta={stats.totalHoursDelta} />}
        value={hours(stats.totalMinutes)}
      />
      <StatCard
        icon={<Award className="h-4 w-4 text-muted-foreground" />}
        label="Courses Completed"
        subline={<DeltaBadge delta={stats.coursesCompleted.delta} />}
        value={stats.coursesCompleted.total.toString()}
      />
      <StatCard
        icon={<Target className="h-4 w-4 text-muted-foreground" />}
        label="Current Streak"
        subline={<p className="text-muted-foreground text-xs">Keep it up!</p>}
        value={`${stats.currentStreakDays} days`}
      />
      <StatCard
        icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
        label="Avg. Daily Time"
        subline={<p className="text-muted-foreground text-xs">Last 7 days</p>}
        value={formatDuration(stats.avgDailyMinutes)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + format**

Run: `pnpm typecheck && pnpm check:write`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/Progress/ProgressStatsCards
git commit -m "feat(ui): student progress stat cards"
```

### Task 18: `WeeklyActivity` component

**Files:**
- Create: `app/_components/Dashboard/Progress/WeeklyActivity/index.tsx`, `.../types.ts`

**Interfaces:**
- Consumes: `WeeklyActivityDay[]`.

- [ ] **Step 1: Types**

```ts
// app/_components/Dashboard/Progress/WeeklyActivity/types.ts
import type { WeeklyActivityDay } from "@/server/entities/student/progress";

export type WeeklyActivityProps = { days: WeeklyActivityDay[] };
```

- [ ] **Step 2: Component (bars scaled to the week max; zero days still render)**

```tsx
// app/_components/Dashboard/Progress/WeeklyActivity/index.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { WeeklyActivityProps } from "./types";

export default function WeeklyActivity({ days }: WeeklyActivityProps) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Activity</CardTitle>
        <CardDescription>Your learning hours this week</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {days.map((day) => (
            <div className="space-y-2" key={day.date}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{day.weekday}</span>
                <span className="text-muted-foreground">
                  {(Math.round((day.minutes / 60) * 10) / 10)} hours
                </span>
              </div>
              <Progress value={(day.minutes / max) * 100} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck + format**

Run: `pnpm typecheck && pnpm check:write`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/_components/Dashboard/Progress/WeeklyActivity
git commit -m "feat(ui): weekly activity chart"
```

### Task 19: Wire the progress page to real data

**Files:**
- Modify: `app/dashboard/progress/page.tsx`

- [ ] **Step 1: Replace the stat cards + weekly activity with real data**

Convert the component to `async`, fetch once, and render the new components. Keep the Achievements and Skill Progress sections exactly as they are (deferred). Remove the local `weeklyActivity` array and the four hardcoded stat `Card`s; replace with:

```tsx
import ProgressStatsCards from "@/app/_components/Dashboard/Progress/ProgressStatsCards";
import WeeklyActivity from "@/app/_components/Dashboard/Progress/WeeklyActivity";
import getProgressStats from "@/lib/requests/student/getProgressStats";

export default async function ProgressPage() {
  const stats = await getProgressStats();
  // …header unchanged…
  // <ProgressStatsCards stats={stats} />
  // <div className="grid gap-6 lg:grid-cols-2">
  //   <WeeklyActivity days={stats.weeklyActivity} />
  //   {/* Achievements card — unchanged */}
  // </div>
  // {/* Skill Progress card — unchanged */}
}
```

Keep the `achievements` and `skillProgress` arrays and their cards untouched.

- [ ] **Step 2: Typecheck + format + full unit suite**

Run: `pnpm typecheck && pnpm check:write && pnpm test:unit`
Expected: PASS.

- [ ] **Step 3: Manual smoke (per validation.md)**

Run: `pnpm dev`, sign in as a student with completed lessons, open `/dashboard/progress`. Confirm real hours, a 7-bar week, streak, and avg daily time; a fresh student shows zeros + a flat chart.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/progress/page.tsx
git commit -m "feat(progress): render real student progress data"
```

---

## Self-Review

**Spec coverage:**
- FR1 Total Hours → Tasks 9, 13, 14, 17. FR2 hours delta → Tasks 2, 9, 14. FR3/FR4 courses completed + delta → Tasks 12, 14, 17. FR5 streak → Tasks 11, 14. FR6 avg daily → Tasks 10, 14, 17. FR7 weekly chart → Tasks 10, 14, 18. FR8 single fetch → Tasks 15, 16, 19. FR9 authz → Task 15. FR10 duration capture (form/editor) → Task 7. FR11 AI builder → Task 7 (+ eval step). FR12 backfill → Tasks 4, 6.
- Migration ordering (spec Data model) → Tasks 5 (add), 6 (backfill), 7 (rename refs), 8 (drop).
- Reusable foundations (formatDuration, getWeekWindows, StatDelta move, hours aggregation) → Tasks 1–3, 9.

**Placeholder scan:** none — every code step shows complete code; integration tests reference `seed*` helpers to be written in the style of the existing `enrollment.repository.integration.test.ts`.

**Type consistency:** `StatDelta` (Task 1) is consumed unchanged in Tasks 13/17. `getWeekWindows` returns `{ startThisWeek, startPriorWeek }` (Task 2), consumed in Tasks 9 and 14. `StudentProgressStats` (Task 13) is produced by Task 14, consumed by Tasks 16/17/19. Repo method names match the service mocks and calls (`getCompletedMinutesTotals`, `getDailyCompletedMinutes`, `getCompletionDays`, `getStudentCompletionStats`).