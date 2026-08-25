# Study Guide Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria.

**Goal:** Make the instructor's lesson editor show the study guide that was actually generated —
full summary, every concept, every glossary term — and stamp it with a relative time a human can
read.

**Architecture:** No server change. The two existing views (`StudyGuideCard` for students,
`StudyGuideToolbar` for instructors) start sharing two presentational list components and one
glossary parse helper, so the counts and the entries can never disagree and neither view casts raw
Json into a `.map`. The time stamp moves from a hand-rolled `Intl.RelativeTimeFormat(…, "minute")`
call to the repo's existing `relativeTimeLabel`, extracted into a colocated `utils.ts` so it is unit
testable in a repo that has no React test runner.

**Track:** `standard`. `pnpm classify` → `STANDARD-OR-DIRECT`, 2 changed files: *"No new authority
and no control touched — the guarded track does not apply. Controls for surfaces already covered are
inherited by reference."* No `security.md`, and no design-mode auditor ran. The one inherited control
this change can break — `off_origin_link: NOT_RENDERED_AS_MARKDOWN` for `lessonInsightsAI` in
`aiSurfaces.ts` — is a claim about the render path, and this plan adds a second render path, so it
gets its own task with its own test (Task 5).

**Reconnaissance:** no `feature-dev:code-explorer` dispatch. Every surface `spec.md` names was read
first-hand while writing the spec, and the anchors below are cited from those reads. A cold agent
would re-derive context this session already holds — the constitution's own rule (§Agent economics:
"a subagent is bought for context isolation, not intelligence"). No `code-architect` either: there
is no new layer, service, or migration here.

**Codebase anchors (verified during planning):**

- `StudyGuideToolbar` (`app/_components/Course/components/Lesson/LessonContentEditor/components/StudyGuideToolbar/index.tsx:55`)
  — the instructor card. Line 82 holds the `Intl.RelativeTimeFormat(…).format(…, "minute")` call
  that produces "129,188 minutes ago"; lines 114–115 truncate the summary at 180 chars; lines
  120–127 are the count badges that replace the entries.
- `useStudyGuideToolbar` (`…/StudyGuideToolbar/hooks/useStudyGuideToolbar.ts:5`) — owns the query,
  the `isStale` comparison (`:29`), and the separately computed `conceptCount` / `glossaryCount`
  (`:34`, `:36`) that AC 6 collapses into the rendered lists.
- `StudyGuideCard` (`app/_components/Course/components/Lesson/StudyGuideCard/index.tsx:15`) — the
  student view; its concept `<ul>` (`:37`) and glossary `<dl>` (`:56`) are the markup Tasks 3 and 4
  share.
- `useStudyGuide` (`…/StudyGuideCard/hooks/useStudyGuide.ts:5`) — returns `null` before insights
  load and casts `insights.glossary as GlossaryItem[]` at `:13`. That cast is what AC 9 removes.
- `CollapsibleSection` (`…/StudyGuideCard/components/CollapsibleSection/index.tsx:7`) — stays where
  it is and stays student-only; the instructor view is expanded inline, so it is not promoted to
  `_shared`.
- `relativeTimeLabel` (`lib/utils/date/relativeTime.ts:4`) — `formatDistanceToNow(date, { addSuffix:
  true })`, **default export**, already unit tested. AC 2's "not a second hand-rolled formatter".
- `parseStoredConcepts` (`server/repositories/lessonInsights.conceptsSchema.ts:38`) — the fail-soft
  shape Task 1 mirrors for `glossary`: drop the malformed, never throw. Its header comment explains
  why a read boundary carries no cardinality bound.
- `lessonInsightsRepository.findByLessonId` (`server/repositories/lessonInsights.repository.ts:34`)
  — parses `concepts`, leaves `glossary` as raw `Prisma.JsonValue`. Unchanged by this plan; see
  spec.md → Agent notes for why the parse stays client-side.
- `lessonInsightsAIService.getForLesson` (`server/services/lessonInsightsAI/lessonInsightsAI.service.ts:117`)
  — the instructor-or-enrolled-student `where` clause behind AC 11. Task 6 tests it; nothing changes it.
- `aiSurfaces.ts` entry for `lessonInsightsAI` (`server/services/_shared/conformance/aiSurfaces.ts:155`)
  — `off_origin_link: NOT_RENDERED_AS_MARKDOWN` (`:75`, `:172`). The claim Task 5 pins.
- `componentConventions.contract.test.ts` (`app/_components/componentConventions.contract.test.ts:26`)
  — `componentFiles()`, the recursive `index.tsx` walker Task 5's import check reuses in shape.
- `vitest.config.ts:14` — the `unit` project is `environment: "node"` and includes only
  `**/*.test.ts`. **There is no `.tsx` test project and no jsdom**: no component in this repo has a
  rendering test, and this plan does not add one. Every assertion below therefore lands on a `.ts`
  helper, a contract test, or an integration test — and the JSX itself is covered by `pnpm
  typecheck` plus the manual checks in Final verification.

**Per-task conventions:** colocated `types.ts` for every prop type (no inline `*Props`); arrow
functions only; helpers in `utils.ts`; one component per folder; no nested ternaries. After the
implement step, `pnpm typecheck` and `pnpm check` must be clean before committing. Unit tests are
colocated `*.test.ts`; integration tests `*.integration.test.ts`.

---

## Task 1 — A malformed glossary degrades instead of crashing the page

- **Contract:** `parseGlossary(value: unknown)` returns `{ term, definition }[]`, keeping every
  well-formed entry and silently dropping the rest. A non-array — `null`, a JSON string, a bare
  object — yields `[]`. It never throws. This is `parseStoredConcepts`'s fail direction applied to
  the one Json column that has no boundary.
- **Test:** `lib/parse/parseGlossary.test.ts` — a well-formed list survives intact; a list mixing a
  good entry with one missing `definition` and one non-object keeps only the good entry (fails
  today: there is no such function, and both call sites cast); `null` / `undefined` / `"[]"` /
  `{ term, definition }` each yield `[]`.
- **Files:** `lib/parse/parseGlossary.ts`, `lib/parse/parseGlossary.test.ts`
- **AC:** spec.md #8, #9, #12
- **Commit:** `feat(study-guide): parse the stored glossary at the read boundary`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module does not exist) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — The "last generated" stamp reads in a sane unit

- **Contract:** `lastGeneratedLabel(generatedAt: Date | string)` returns a human relative distance
  ("3 minutes ago", "about 2 hours ago", "3 months ago") by delegating to `relativeTimeLabel`, and
  `StudyGuideToolbar` renders that instead of its inline `Intl.RelativeTimeFormat` call. The
  accepted `string` is deliberate: the value arrives from a tRPC query and the component must not
  care whether superjson revived it.
- **Test:** `…/StudyGuideToolbar/utils.test.ts` — 3 minutes ago renders `"3 minutes ago"`; 90 days
  ago renders a label containing `"months"`; and, the case that fails today, **no** input in a set
  spanning minutes → years produces a label containing a 3-or-more-digit number
  (`/\d{3,}/` must not match). The current code renders "129,188 minutes ago" for the 90-day case
  and would fail all three.
- **Files:** `app/_components/Course/components/Lesson/LessonContentEditor/components/StudyGuideToolbar/utils.ts`,
  `…/StudyGuideToolbar/utils.test.ts`, `…/StudyGuideToolbar/index.tsx`
- **AC:** spec.md #1, #2
- **Commit:** `fix(study-guide): render the last-generated stamp in a readable unit`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`lastGeneratedLabel` does not exist; the
      inline formatter it replaces is minutes-only) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — Concepts and glossary render from one shared pair of components

- **Contract:** `ConceptList` and `GlossaryList` are presentational arrow components that take
  already-parsed arrays and render them — a concept as name plus optional explanation (a concept
  with no `explanation` renders its name and no empty paragraph, matching `StoredConceptSchema`
  where the field is optional), a glossary entry as `<dt>`/`<dd>`. `StudyGuideCard` renders through
  them and takes its glossary from `parseGlossary` instead of the `as GlossaryItem[]` cast. The
  student's collapsible layout is unchanged on screen.
- **Test:** none automated — these are pure JSX with no branching logic beyond the optional
  explanation, and the repo has no `.tsx` test project (see anchors). `pnpm typecheck` proves the
  prop contracts line up; the student card is verified by hand in Final verification. Stating this
  rather than inventing a test that asserts nothing.
- **Files:** `app/_components/Course/components/Lesson/ConceptList/index.tsx`,
  `…/ConceptList/types.ts`, `app/_components/Course/components/Lesson/GlossaryList/index.tsx`,
  `…/GlossaryList/types.ts`, `…/StudyGuideCard/index.tsx`, `…/StudyGuideCard/types.ts`,
  `…/StudyGuideCard/hooks/useStudyGuide.ts`
- **AC:** spec.md #4, #5, #9
- **Commit:** `refactor(study-guide): share the concept and glossary lists between both views`

- [ ] Extract `ConceptList` + `GlossaryList` with colocated `types.ts` (`Concept`, `GlossaryItem`
      move out of `StudyGuideCard/types.ts` to the component that owns them)
- [ ] Point `StudyGuideCard` at them and at `parseGlossary`; delete the cast
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] `pnpm test:unit` still green · [ ] Commit

---

## Task 4 — The instructor sees the whole guide, not its dimensions

- **Contract:** `StudyGuideResults` renders, inside the instructor's card and always expanded: the
  **complete** summary (no 180-char slice, no ellipsis), a `Key Concepts (N)` heading over
  `ConceptList`, and — only when there is at least one term — a `Glossary (N)` heading over
  `GlossaryList`. `N` is `array.length` of the very array being rendered, so a count can never
  disagree with the list. The concept section renders even at zero, because a guide with no concepts
  is a defect the instructor should see. `useStudyGuideToolbar` returns parsed `concepts` and
  `glossary` and no longer returns `conceptCount` / `glossaryCount`; the count badges are gone.
- **Test:** none automated, same reason as Task 3 — but the removal of `conceptCount` /
  `glossaryCount` from the hook's return makes AC 6 a **compile-time** property: after this task
  there is no second count in the codebase to drift. `pnpm typecheck` is the proof that nothing
  still reads the removed fields.
- **Files:** `…/StudyGuideToolbar/components/StudyGuideResults/index.tsx`,
  `…/StudyGuideResults/types.ts`, `…/StudyGuideToolbar/index.tsx`,
  `…/StudyGuideToolbar/hooks/useStudyGuideToolbar.ts`
- **AC:** spec.md #3, #4, #5, #6, #7
- **Commit:** `feat(study-guide): show the generated guide in the lesson editor`

- [ ] Add `StudyGuideResults` · [ ] Widen the hook to return parsed arrays, drop the count fields
- [ ] Replace the truncated summary and badges in `StudyGuideToolbar` · [ ] `pnpm typecheck` +
      `pnpm check` clean · [ ] Commit

---

## Task 5 — ~~The new render path cannot quietly become a markdown path~~ DROPPED

**Dropped during execution: the coverage already exists, and is stronger than what this task would
have added.** The plan asserted that `aiSurfaces.ts`'s `off_origin_link: NOT_RENDERED_AS_MARKDOWN`
claim was "prose nobody could check". That was wrong.
`app/_components/_shared/markdown/renderers.contract.test.ts:36` walks **all** of `app/`, collects
every file that imports `react-markdown` *and* renders it, and asserts set-equality against
`RENDERER_POLICY` — in both directions.

Verified rather than assumed: a `<Markdown>` was temporarily added to `ConceptList`, and the
existing test failed naming
`app/_components/Course/components/Lesson/ConceptList/index.tsx` as an undeclared renderer; it went
green again on revert.

A study-guide-scoped test would therefore be duplicate coverage over a strict subset of the same
files, with a second walker to maintain. AC 10 is satisfied by the existing contract test, and
`spec.md` #10 now names it.

---

## Task 6 — The read stays instructor-or-enrolled

- **Contract:** `lessonInsightsAIService.getForLesson` returns the row for the lesson's instructor
  and for a student with a non-cancelled enrollment, and `null` for everyone else — a different
  instructor, an unenrolled student, a student whose enrollment is `cancelled`. Nothing in this
  change touches that query; the task exists because AC 11 is a *don't-break* criterion and an
  untested one is indistinguishable from an absent one (ADR-017 Rule 2).
- **Test:** `server/services/lessonInsightsAI/lessonInsightsAI.authz.integration.test.ts` — the
  three denial cases each return `null`, the two allow cases return the row. **First check whether
  `server/repositories/lessonInsights.readBoundary.integration.test.ts` already covers the service
  layer**; if it does, extend that file instead of adding a second one and say so in the commit.
- **Files:** `server/services/lessonInsightsAI/lessonInsightsAI.authz.integration.test.ts` (or the
  existing read-boundary integration test)
- **AC:** spec.md #11
- **Commit:** `test(study-guide): prove getForLesson denies non-instructors and non-enrollees`

- [ ] Check the existing read-boundary test's coverage · [ ] Write the denial cases · [ ] Run
      `pnpm test:integration`, see them PASS · [ ] Break the `OR` clause on purpose, see them FAIL
- [ ] Restore · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. When you do, say so on the task line: `code included: <reason>`. No task
here meets it.

## Self-review (run before handoff)

| AC | Task | How it is proven |
|---|---|---|
| 1 — no unreadable unit | 2 | `utils.test.ts`: no label matches `/\d{3,}/` |
| 2 — reuses `relativeTimeLabel` | 2 | `lastGeneratedLabel` delegates; the inline `Intl` call is deleted |
| 3 — full summary, no ellipsis | 4 | the 180-char slice is removed; typecheck + manual |
| 4 — every concept, optional explanation | 3, 4 | `ConceptList` is the single renderer for both views |
| 5 — every glossary entry | 3, 4 | `GlossaryList` is the single renderer for both views |
| 6 — counts equal entries rendered | 4 | the separate count fields are deleted from the hook — compile-time |
| 7 — glossary omitted when empty, concepts not | 4 | `StudyGuideResults` guard; manual |
| 8 — malformed glossary degrades | 1 | `parseGlossary.test.ts` mixed-validity case |
| 9 — no raw Json `.map` in either view | 1, 3, 4 | both hooks return parsed arrays; the cast is deleted |
| 10 — plain text, never markdown | — (Task 5 dropped) | the pre-existing `renderers.contract.test.ts`, verified by breaking it |
| 11 — authorization unchanged | 6 | integration denial cases, verified by breaking the `OR` |
| 12 — typecheck/check/unit tests | 1–6 | per-task gate + Final verification |

- **Guarded coverage:** n/a — `pnpm classify` named no authority and no control. The single inherited
  control at risk (`off_origin_link`) has its own task with its own test (Task 5), not an assertion
  bolted onto a UI task.
- **Contract clarity:** each task states an observable outcome. Tasks 3 and 4 declare *no automated
  test* with the reason, rather than claiming coverage the repo's test setup cannot provide.
- **Type consistency:** `Concept` / `GlossaryItem` are defined once, in `ConceptList/types.ts` and
  `GlossaryList/types.ts`, and imported everywhere else. `parseGlossary` returns
  `ParsedGlossaryItem`, structurally identical to `GlossaryItem`; Task 3 must confirm they unify
  rather than introducing a second name for one shape.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm test:unit` must still pass `componentConventions.contract.test.ts`: the four new components
  add no `export function` (the ratchet budget of 66 must not rise) and no inline `*Props` type.
- Task 5's contract test is verified by breaking what it guards — add a markdown import, watch it go
  red, revert. Task 6's the same way, against the `OR` clause.
- Manual, in the running app: open a lesson with a generated guide as its instructor
  (`/instructor/courses/<id>/lessons/<id>`) and confirm the stamp reads in a human unit, the summary
  is complete, and every concept and glossary term is listed. Open the same lesson as an enrolled
  student and confirm the student card is unchanged. Save the lesson and confirm the "Content
  changed" badge replaces the stamp while the guide text stays on screen.
- Confirm the timestamp question from spec.md → Edge cases: clicking Regenerate on unchanged content
  is a cache hit and legitimately leaves the stamp where it is. If the stamp does not move, that is
  the cache working, not this fix failing.