# L2 Scope — Implementation Plan (scope item 12)

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Steps use checkbox (`- [ ]`) syntax.
> See [`../spec.md`](../spec.md) for the design and Acceptance criteria.

**Goal:** put a lesson's own concept names inside the L2 relevance scope, so the concept-check
mechanism is reachable by the phrasing the tutor's prompt invites.

**Architecture:** two pure functions and one wiring change. A shared parser turns
`lessonInsights.concepts` (LLM-authored JSON) into canonical names; a pure builder assembles the
`GuardDomain` from course title, lesson title and those names, bounded. The chat route feeds it from
the enrollment query that already proves access, so no extra round trip. Nothing about the *trust*
treatment changes — the description is still wrapped as `course_data` by `topicRelevance.ts`.

**Track:** `STANDARD-OR-DIRECT` — `pnpm classify` reported *"No new authority and no control touched
— the guarded track does not apply"*. Read that with its limit: the classifier reads the diff, and
at `/spec` time no source had changed, so it was judging documentation only. The change modifies the
**input** to an existing control (L2's notion of scope), which is why `/spec` took the standard tier
and deferred the audit: **`llm-security-auditor` checks this at `/qa`**, once, against real code.

**Codebase anchors (verified during planning):**

- `guardUserInput(text, context)` (`server/services/_shared/aiGuard/guardUserInput.ts:26`) — L1 then
  L2; returns rather than throws. Unchanged by this work.
- `GuardDomain = { description, subject }` (`server/services/_shared/aiGuard/types.ts:11`) —
  `description` feeds L2's prompt, `subject` builds the student-facing refusal. The two must not be
  conflated: only `description` widens.
- `buildSystemPrompt` (`server/services/_shared/aiGuard/topicRelevance.ts:13`) — interpolates
  `wrapUntrustedContent(domain.description, "course_data")` at `:16` and closes with
  `UNTRUSTED_DATA_CLAUSE` at `:30`. This is why concept names need no new wrapper: they inherit the
  region titles already sit in.
- The domain literal to replace (`app/api/chat/lesson/route.ts:86-89`) — built from `courseTitle` and
  `lesson.title` only. This line is the defect.
- The enrollment query that already proves access (`app/api/chat/lesson/route.ts:40-66`) — selects
  `course.sections.lessons { id, title }`. `Lesson.lessonInsights` is a `LessonInsights?` relation
  (`prisma/schema/lesson.prisma:22`), so concepts can join this query rather than add one.
- The concept parsing to share (`server/services/lessonAI/lessonAI.service.ts:133-139`) — maps
  `concepts[].name`, filters to non-empty strings. Its comment states why: the array is LLM JSON with
  no schema, and a non-string entry throws inside `toolPolicy`'s `trim()`.
- `canonicalConceptSpelling(raw)` (`server/services/_shared/concepts/conceptKey.ts:57`) — collapses
  padding, returns `null` above `MAX_CONCEPT_NAME_LENGTH` (`masteryLevels.ts:19`, 80). Reused so an
  unstorable name never reaches a prompt.
- `DOMAINS.lessonAI` (`evals/aiGuard/adversarial.eval.ts:13`, `evals/aiGuard/redteam.eval.ts:13`) —
  the fixture both guard evals classify against. Widening it here is what makes the recall
  measurement compare like with like.
- `accuracyGate("aiGuard:adversarial", results, 0.85)` (`adversarial.eval.ts:59`) — that eval gates.
  `redteam.eval.ts` ends `return true` and prints *"This eval never fails the run. Record the number
  in security.md S13"* — so for redteam the deliverable is a recorded number, not a pass.
- `expected: { outcome: string }` with `manipulation_*` rows inverting to `allow`
  (`redteam.eval.ts:9,40,67`) — the row shape a reachability case reuses.

**Per-task conventions:** after the implement step, `pnpm typecheck` and `pnpm check` must be clean
before committing. Unit tests colocated `*.test.ts`; integration `*.integration.test.ts`.

---

## Task 1 — One rule for reading concept names out of insights

- **Contract:** a shared function turns a `lessonInsights.concepts` value into canonical concept
  names: non-strings and empties dropped, padding collapsed, anything unstorable dropped. The tutor
  service and the chat route both call it, so the two cannot disagree about what a lesson's concepts
  are.
- **Test:** `server/services/_shared/concepts/lessonConcepts.test.ts` — a well-formed array;
  `null`/absent insights → `[]`; a numeric and an object entry dropped; `"  API   Routes  "` →
  `"API Routes"`; an 81-character name dropped; a non-array value → `[]`.
- **Files:** `server/services/_shared/concepts/lessonConcepts.ts`,
  `server/services/lessonAI/lessonAI.service.ts` (call it instead of the inline map)
- **AC:** spec.md item 12, "each is run through the same `canonicalConceptSpelling` rule"
- **Commit:** `refactor(concepts): one rule for reading concept names out of insights`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module absent) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> The service's existing behaviour must not change: `lessonConcepts` feeds `toolPolicy`'s allowlist,
> so a name that stops resolving there silently disables checks for that concept. Run
> `pnpm vitest run server/services/lessonAI/` before committing, not only the new file.

---

## Task 2 — The lesson's concepts are in the classifier's scope

- **Contract:** `lessonGuardDomain({ courseTitle, lessonTitle, concepts })` returns the `GuardDomain`
  L2 receives. Its `description` names the course, the lesson **and** the lesson's concepts; its
  `subject` names the course and nothing else. With no concepts it returns today's string byte for
  byte. The number of names it admits is bounded by an exported constant.
- **Test:** `server/services/lessonAI/guardDomain.test.ts` — description contains a concept that does
  not appear in the lesson title; `subject` contains no concept name; empty concepts reproduce
  `the course "X" and its lesson "Y"` exactly; 40 concepts in, at most `MAX_DOMAIN_CONCEPTS` out; a
  padded name appears collapsed and an oversized one does not appear.
- **Files:** `server/services/lessonAI/guardDomain.ts`
- **AC:** spec.md item 12, bullets 4 (subject unchanged), 5 (no-insights byte-identical), 6 (bounded
  and canonicalised)
- **Commit:** `feat(aiGuard): put the lesson's concepts in the relevance scope`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module absent) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

> The bound is the security-relevant half of this task, not a tuning constant: every admitted name
> lands in an untrusted region of a prompt that runs before the first token of every turn, and
> `lessonInsights.concepts` has a loose upper bound. Pin the bound in the test rather than restating
> the number.

---

## Task 3 — The route feeds it, from the query that already proved access

- **Contract:** the tutor chat route builds its `GuardDomain` with `lessonGuardDomain`, and the
  concepts come from the **same** enrollment query that authorises the turn — no second round trip,
  and no id from the request used to re-fetch them (ADR-023).
- **Test:** `app/api/chat/lesson/route.guardrails.integration.test.ts` — a seeded lesson with
  insights: the domain handed to `guardUserInput` contains a concept name that is absent from both
  titles; a lesson with **no** insights row still produces the two-title description and the turn
  proceeds normally.
- **Files:** `app/api/chat/lesson/route.ts`
- **AC:** spec.md item 12, bullets 5 and 7 (no extra database round trip)
- **Commit:** `feat(tutor): scope the guard to the lesson the student is in`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — The reachability the feature depends on becomes a measured row

- **Contract:** the guard datasets carry rows that must be **allowed**: a message naming only a
  lesson concept (`Can you check my understanding of <concept>?`), against a domain whose lesson
  title shares no vocabulary with it. The `DOMAINS.lessonAI` fixture in both guard evals is widened
  to the shape the route now builds, so every existing row is re-measured under the real domain.
- **Test:** `evals/datasets/aiGuard/redteam.jsonl` rows with `expected.outcome: "allow"`, exercised
  by `evals/aiGuard/redteam.eval.ts`; the fixture change also lands in
  `evals/aiGuard/adversarial.eval.ts`.
- **AC:** spec.md item 12, bullet 1 (the phrasing passes, measured over ≥ 5 draws, currently 0/5)
- **Commit:** `test(evals): measure whether a concept name reaches the tutor`

- [ ] Write the failing rows · [ ] Run `pnpm eval aiGuard:redteam`, see them refused (the
      pre-fix rate) · [ ] Apply Tasks 1–3 · [ ] Re-run, record the rate · [ ] Commit

> A single draw is not a property. S13 §5 measured this surface's run-to-run spread as larger than
> any effect being tested, and the first version of this very finding was reported from one draw
> against a mis-specified domain. Five draws minimum, and record the rate rather than a verdict.

---

## Task 5 — Prove the widened scope did not blunt the filter

- **Contract:** enforcement recall on the guard datasets is measured **before and after** the widened
  domain, and the delta is recorded. `aiGuard:adversarial` still clears its gates; `aiGuard:redteam`
  never fails a run by design, so its number is written into `security.md` S13 rather than asserted.
  The two controls that must not move: a plainly unrelated message is still refused, and the
  false-positive rate on legitimate injection-as-subject-matter authoring stays ≤ 5%.
- **Test:** `pnpm eval aiGuard:adversarial` (gates at `accuracyGate(..., 0.85)` plus its precision
  gate) and `pnpm eval aiGuard:redteam` (report-only), each run on both fixtures.
- **Files:** `docs/specs/features/ai-tutor-guardrails/security.md` (S13 entry),
  `docs/specs/features/ai-input-trust-boundary/spec.md`
- **AC:** spec.md item 12, bullets 2 (controls hold) and 3 (enforcement recall does not fall)
- **Commit:** `test(evals): record what widening the guard scope cost`

- [ ] Run both evals on the narrow fixture, record · [ ] Run both on the widened fixture, record
- [ ] Write the delta into S13 · [ ] Commit

> This is the task the feature is traded against, and it is the one most likely to be skipped
> because it produces prose rather than green ticks. L2 refuses most attacks on this surface as
> *off-topic* rather than as attacks (`ai-tutor-guardrails` S13 §18) — widening what counts as
> on-topic is precisely the change that erodes that. **A drop is a finding to record, not a number
> to bury.** If recall falls materially, stop and bring the number back rather than shipping and
> writing it up.

---

## Task 6 — Gate Docs

- **Contract:** `ai-input-trust-boundary/spec.md` status returns to `stable` with item 12's criteria
  reflecting what was built; the S5 sentence in `ai-tutor-guardrails/security.md` that describes the
  domain as "built from the course and lesson titles" is corrected; the instructor-widening residual
  and the measured recall delta are recorded in S13; `manual-qa.md` MQ-1 gets phrasings re-measured
  against the new domain, because the ones committed on 2026-08-30 were chosen against the old one.
- **Test:** `specSections.contract.test.ts` and `docLinks.contract.test.ts` green; `pnpm spec:sync`
  produces no diff.
- **AC:** Gate Docs / DoD
- **Commit:** `docs(trust-boundary): close the L2 scope item`

- [ ] Amend each document · [ ] `pnpm spec:sync` · [ ] Contract tests green · [ ] Commit

> No ADR. This is a scope correction inside an already-decided guard architecture — ADR-022 covers
> the *why* of the layered boundary and is not reversed by changing what one layer is told is in
> scope. If Task 5 shows recall falling enough to change the layering argument, that conclusion is
> an ADR and this line is wrong.

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**No task here qualifies for the exception.** There is no migration, no money path, and no guard
regex; the one string whose exact form matters is the no-concepts description, and Task 2 pins it
byte for byte with a test instead of a code block.

## Self-review (run before handoff)

| Acceptance criterion (spec.md item 12) | Task |
|---|---|
| A concept-only message passes L2 on a lesson whose title shares no vocabulary, ≥ 5 draws | 4 (measured), 2–3 (mechanism) |
| Controls hold: content question passes, unrelated refused, FP ≤ 5% | 5 |
| Enforcement recall does not fall | 5 |
| Student-facing off-topic message unchanged | 2 |
| No-insights lesson produces today's description byte for byte | 2, 3 |
| Concept count bounded, names canonicalised | 1, 2 |
| No extra database round trip | 3 |

- **Guarded coverage:** the classifier named no authority and no control, so there is no guarded list
  to cover. The control this change *modifies* — L2's scope — is covered by Tasks 4 and 5, which
  measure both directions (reachability and recall), and is audited at `/qa` by
  `llm-security-auditor`.
- **Probabilistic control:** Task 4 supplies the recall-side rows and Task 5 the false-positive side,
  as the template requires — neither alone would settle it.
- **Contract clarity:** every task states an observable behaviour.
- **Type consistency:** `lessonGuardDomain`, `MAX_DOMAIN_CONCEPTS`, `lessonConceptNames`,
  `GuardDomain`, `canonicalConceptSpelling` are used identically across tasks.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- `pnpm eval aiGuard:redteam` and `pnpm eval aiGuard:adversarial` — both fixtures, both numbers
  recorded in S13.
- **Against `pnpm dev`, not production:** the phrasing that failed 0/5 —
  `Can you check my understanding of <concept>?` — produces a question panel, and
  `concept_mastery` gains no row until that question is answered correctly. This is the run that
  closes MQ-1, and it is the first end-to-end evidence the check mechanism works at all.
- Break Task 2's bound on purpose (admit every concept) and see the bound test go red. A test that
  never fails proves nothing.
