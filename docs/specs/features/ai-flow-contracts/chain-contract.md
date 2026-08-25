# AI chain contracts — quizAI and lessonInsightsAI

The step-by-step contract for the two AI surfaces that are neither LangGraph graphs nor the tutor's
ReAct loop. `chainContract.contract.test.ts` fails CI if a tool, a chain, or a step module exists
without a row here, so this file cannot silently fall behind the code.

**Why a third document.** [`graph-contract.md`](graph-contract.md) documents the two graphs, where
completeness is free: `graph.ts` registers every node, so the test can enumerate them.
[`ai-tutor-guardrails/flow-contract.md`](../ai-tutor-guardrails/flow-contract.md) documents the tutor,
a ReAct chain whose completeness is pinned against its closed tool set. These two are smaller again —
`quizAI` is a bounded retry loop around a two-tool agent, `lessonInsightsAI` is three prompts run in
parallel — and neither has nodes, state channels, or a turn. What they do have is a linear sequence
of stations, each with an input, an output, and a failure mode, and the same asymmetry the tutor has
about **when a model result may be written to the database**. That asymmetry is the reason they need
documenting rather than reading: the two surfaces answer it in opposite directions.

---

## quizAI — stations

Read top to bottom: one `quiz.generateAI` call, from tRPC to the questions the instructor sees.

| # | Station | Where | Purpose | In | Out | Validation | Model | Failure |
|---|---|---|---|---|---|---|---|---|
| 1 | role gate | `routers/quiz.ts:66` `instructorProcedure` | students cannot generate | session | `ctx.session.user.id` | role check at the procedure | none | `FORBIDDEN`, nothing persisted |
| 2 | rate limit | `routers/quiz.ts:67` `aiRateLimit("quizAI")` | bound per-user model cost | `userId`, feature | pass/deny | 10/min per user, aggregate 30/min | none | `TOO_MANY_REQUESTS`; **fails closed** when the store is unavailable (ADR-027) |
| 3 | input validation | `QuizGenerateAIDto` | reject malformed input before any DB read | tRPC input | `{ lessonId, count, regenerate }` | Zod | none | `BAD_REQUEST` |
| 4 | ownership + content | `quizAI.service.ts:71` | the query that authorizes is the query that acts — the lesson is fetched *through* `section.course.instructorId` | `lessonId`, `instructorId` | `lesson.content`, `course.level` | ownership filter inside the same query | none | `QuizForbiddenError` (`FORBIDDEN`); empty content → `LessonHasNoContentError` (`BAD_REQUEST`) |
| 5 | cache read | `quizAI.service.ts:95` `quizRepository.findByLesson` | an initial generation on a lesson that already has questions returns them instead of paying for a model call | `lessonId` | existing questions | skipped entirely when `regenerate` | none | propagates; **only reached when `regenerate` is false** |
| 6 | prompt construction | `quizAI.agent.ts:72` | assemble one of two system prompts | `count`, `level`, `regenerate` | system prompt | `level` is `z.string().min(1)`, i.e. instructor-authored free text landing in a system prompt — wrapped as `course_data` + `UNTRUSTED_DATA_CLAUSE` | none | the two prompts differ in one rule: the regenerate prompt forbids `get_existing_quizzes` |
| 7 | agent construction | `quizAI.agent.ts:77` `createQuizAgent` | bind the tool set and the response schema | tool factories, `QuizOutputSchema` | agent | tool array is a **closed literal**, and it is *shorter* on regenerate — an unregistered name is unrepresentable | `gpt-4o-mini`, t=0.3 initial / 0.9 regenerate, 30 s timeout, 2 retries | propagates |
| 8 | attempt loop | `quizAI.service.ts:115` | bound the cost of steering | `MAX_ATTEMPTS` = 3 | up to 3 model invocations | the loop *is* the bound | — | exhaustion → station 12 |
| 9 | model invocation | `quizAI.service.ts:124` `agent.invoke` | run the agent | user message + hint | `structuredResponse` | the user message deliberately **omits the lesson id** — the tools are already bound to it, and naming it hands the model an identifier it has no legitimate use for | `gpt-4o-mini` | caught by the loop's `catch` → station 11 |
| 10 | `get_lesson_content` | `tools/getLessonContent.tool.ts` | read the lesson being written about | `lessonId` **bound at construction** | title + content | id bound server-side; this tool has no ownership filter of its own, which is why it must not be a model argument | none | returns a sentence, not an error, when the lesson has no content |
| 10a | `get_existing_quizzes` | `tools/getExistingQuizzes.tool.ts` | avoid duplicating existing questions | same bound id | question list | output wrapped as `lesson_content`: earlier generations came from instructor content and are untrusted too | none | **not registered at all** on regenerate — the restriction is structural, not a prompt rule |
| 11 | output boundary | `quizAI.service.ts:34` `reportModelText` → `validateModelText` | run the shared boundary over every field that could be persisted | each `question`, its 4 `options`, `correct` | boolean, **report-only** | shared `_shared/aiOutput` rules | none | **never blocks.** One event per *generation*, not per attempt or per field, or a generation that retries twice inflates the count a threshold reads |
| 12 | semantic validation | `quizAI.validator.ts` `validateSemantics` | the checks the schema cannot express | `QuizQuestion[]` | `null` or a violation string | `correct` ∈ `options`; no duplicate options within a question; no duplicate question text | none | a violation becomes the **next attempt's hint** and the loop continues |
| 13 | error path | `quizAI.service.ts:149` | a thrown attempt is retried, quietly | the exception | next attempt with **`hint = ""`** | the exception message must **not** become the hint (C7): it can carry provider text, a stack fragment or lesson content, and feeding it back puts unauthored text into the prompt through the error path | none | logged with detail; the prompt gets nothing |
| 14 | exhaustion | `quizAI.service.ts:167` | declared fail-closed after 3 attempts | — | `fallback_triggered` (`max_attempts_exceeded`) + `MaxRetriesExceededError` | — | none | `INTERNAL_SERVER_ERROR`; without the event, a model steered into repeated invalid output is indistinguishable from a flaky provider |
| 15 | return to the instructor | `routers/quiz.ts:71` | hand the questions back | `QuizQuestion[]` | tRPC response | — | none | **nothing has been written to the database at any point on this path** |

### quizAI — where an AI result may be persisted

**Nowhere on this path.** `generateAI` returns questions; it never writes them. Persistence is a
separate, explicitly instructor-driven call — `quiz.upsertMany` (`instructorProcedure`) — made after
a human has read the questions and edited or accepted them. The human review *is* the boundary, and
it is why the output boundary at station 11 can be report-only without leaving model text unreviewed
in the database.

The one row this path can return from the database is at station 5, and those are questions an
instructor already accepted.

### quizAI — failure matrix

| Scenario | System behavior | What the instructor sees | Persisted |
|---|---|---|---|
| Caller is not the lesson's instructor | ownership filter finds no row | "Lesson not found or access denied" (`FORBIDDEN`) | nothing |
| Lesson has no text content | `LessonHasNoContentError` | `BAD_REQUEST` | nothing |
| Rate-limit store unavailable | **fails closed** | `TOO_MANY_REQUESTS` | nothing |
| Model call errors or times out | caught inside the loop, **hint cleared**, next attempt | nothing until the loop ends | nothing |
| Structured output does not parse | same `catch` as above | as above | nothing |
| Semantic violation (`correct` not in `options`, duplicates) | retry with the violation as hint | nothing until the loop ends | nothing |
| Three attempts exhausted | `fallback_triggered` + `MaxRetriesExceededError` | "Generation failed after max retries" | nothing |
| Output-boundary rule hit | **report-only**: event emitted, questions still returned | the questions, normally | nothing — a human still has to save them |

---

## lessonInsightsAI — stations

One `lessonInsightsAI.generateLessonInsights` call, plus the read path a student takes.

| # | Station | Where | Purpose | In | Out | Validation | Model | Failure |
|---|---|---|---|---|---|---|---|---|
| 1 | role gate | `routers/lessonInsightsAI.ts:12` `instructorProcedure` | only an instructor generates | session | `userId` | role check at the procedure | none | `FORBIDDEN` |
| 2 | rate limit | `aiRateLimit("lessonInsightsAI")` | bound per-user model cost | `userId`, feature | pass/deny | 10/min per user, aggregate 30/min | none | `TOO_MANY_REQUESTS`; **fails closed** (ADR-027) |
| 3 | input validation | `LessonInsightsSchema.shape.lessonId` | reject malformed input | tRPC input | `lessonId` | Zod | none | `BAD_REQUEST` |
| 4 | ownership + content | `lessonInsightsAI.service.ts:69` | ownership filter inside the fetching query | `lessonId`, `instructorId` | `lesson.content` | `section.course.instructorId` | none | `NotInstructorError`; empty content → `LessonHasNoContentError` |
| 5 | content hash | `contentHash.ts` `lessonContentHash` | fingerprint the text the guide was generated from | `lesson.content` | sha256 | — | none | cannot fail. **Named, not inlined**: the generate path writes it and the read path recomputes it, and two inline `createHash` calls would be one `.trim()` apart from disagreeing silently |
| 6 | cache decision | `lessonInsightsAI.service.ts:90` | skip the model when nothing changed | stored row, fresh hash | serve-or-regenerate | `contentHash` match **and** `concepts.length > 0` | none | a matching hash alone is not enough: the read boundary turns a malformed `concepts` into `[]`, so a poisoned row would otherwise short-circuit its own replacement forever. An empty list on a lesson that has content is a **miss**, and regeneration heals the row |
| 7 | prompt input | `lessonInsightsAI.service.ts:95` | the lesson body is the untrusted payload | `lesson.content` | wrapped content | `wrapUntrustedContent(…, "lesson_content")`; each chain's system prompt carries `UNTRUSTED_DATA_CLAUSE` | none | propagates |
| 8 | `summaryChain` | `chains/summary.chain.ts` | one 60–150-word paragraph | wrapped content | `{ summary }` | `SummarySchema` — 40–800 chars | `gpt-4o-mini`, t=0, structured | propagates |
| 9 | `conceptsChain` | `chains/concepts.chain.ts` | 3–7 key concepts | wrapped content | `{ concepts[] }` | `ConceptsSchema` — 3–7 items, name ≤ 80, explanation 10–300 | `gpt-4o-mini`, t=0, structured | propagates. **This output becomes the tutor's tool allowlist** — see Extending this safely |
| 10 | `glossaryChain` | `chains/glossary.chain.ts` | domain terms a beginner would not know | wrapped content | `{ glossary[] }` | `GlossarySchema` — **0**–15 items, so an empty list is valid output | `gpt-4o-mini`, t=0, structured | propagates |
| 11 | `insightsChain` | `chains/parallel.chain.ts` | run the three together | wrapped content | all three results | `RunnableParallel` + `withRetry({ stopAfterAttempt: 2 })` | — | **any one chain failing fails the whole generation** — there is no partial write |
| 12 | output boundary | `lessonInsightsAI.service.ts:36` `reportModelText` → `validateModelText` | run the shared boundary over every field about to be persisted | summary, each concept name + explanation, each glossary term + definition | void, **report-only** | shared `_shared/aiOutput` rules | none | **never blocks**, and the row is written anyway. One event per turn, not per field. Rejection, if it is ever enforced, must be **whole-generation**: `GlossarySchema` permits an empty list, so dropping one entry is silent degradation on a control whose baseline is zero |
| 13 | persist | `lessonInsightsAI.service.ts:100` `upsertByLessonId` | one row per lesson | summary, concepts, glossary, model, hash | `LessonInsights` row | — | none | propagates; `generatedAt` is refreshed on update |
| 14 | read boundary | `lessonInsights.repository.ts` `findByLessonId` → `parseStoredConcepts` | parse `concepts` once, at the boundary | stored JSON | `StoredConcept[]` | `StoredConceptsSchema` — element length bounded (name ≤ 200), **no cardinality bound**: 3–7 is a generation rule and must not gate a read | none | a malformed value yields **`[]` plus one telemetry event, never a throw**. `null` is absence, not corruption, and emits nothing |
| 15 | read path | `lessonInsightsAI.service.ts:116` `getForLesson` | instructor or enrolled student | `lessonId`, `userId` | row + `matchesCurrentContent` | `protectedProcedure` + an OR of instructor-owns / non-cancelled enrollment | none | returns `null` rather than an error when either check fails |

### lessonInsightsAI — where an AI result may be persisted

**Immediately, and unconditionally.** Station 13 writes whatever station 11 produced, and the output
boundary at station 12 is report-only — it cannot stop the write. The controls that make this
acceptable are *upstream*: the input is wrapped, every field is schema-bounded at generation, and the
only reader of `concepts` re-validates at the read boundary (station 14).

This is the exact opposite of `quizAI`, and the asymmetry is deliberate rather than accidental: a
study guide has no human review step between generation and display, so declining to write produces
no visible error an instructor could act on — it simply yields no study guide. Quiz questions have a
review step, so nothing needs to be written until a human accepts them.

The consequence to keep in mind when changing either surface: **`lessonInsightsAI` is the only one of
the two whose model output reaches the database without a human in between**, and its `concepts`
field goes on to become the tutor's `mark_concept_understood` allowlist.

### lessonInsightsAI — failure matrix

| Scenario | System behavior | What the user sees | Persisted |
|---|---|---|---|
| Caller is not the lesson's instructor | ownership filter finds no row | `NotInstructorError` (`FORBIDDEN`) | nothing |
| Lesson has no text content | `LessonHasNoContentError` | `BAD_REQUEST` | nothing |
| Rate-limit store unavailable | **fails closed** | `TOO_MANY_REQUESTS` | nothing |
| Cache hit (hash matches, concepts non-empty) | returns the stored row, **no model call** | the existing guide | unchanged |
| Stored row has empty `concepts` on a lesson with content | treated as a **miss**; regeneration overwrites and heals it | a fresh guide | overwritten |
| One of the three chains fails or its output fails its schema | `RunnableParallel` rejects; `withRetry` gives it 2 attempts, then the whole generation fails | error | **nothing — no partial write** |
| Output-boundary rule hit | **report-only**: event emitted, row written anyway | the guide, normally | **yes** |
| Stored `concepts` malformed at read time | `parseStoredConcepts` → `[]` + one telemetry event | a degraded guide; the tutor's allowlist goes empty and denies every mastery write | unchanged |
| Reader is neither instructor nor enrolled | `getForLesson` returns `null` | no study guide | unchanged |

---

## The brief's sixteen flow steps, mapped

The Area-3 brief lists sixteen steps an AI flow should document. Neither surface has all sixteen;
what each one is missing, and why, is the part worth reading.

| # | Step | quizAI | lessonInsightsAI |
|---|---|---|---|
| 1 | intent classification | **N/A** — one entry point with one intent, selected by the `regenerate` flag, not by a model | **N/A** — same |
| 2 | extraction of structured step data | station 9 — `responseFormat: QuizOutputSchema` makes the whole reply the structured record | stations 8–10 — each chain *is* an extraction, one schema each |
| 3 | context preparation | stations 4–5, and the tools at 10/10a | stations 4–7 |
| 4 | prompt construction | station 6 — two variants | station 7, plus the three system prompts |
| 5 | model invocation | station 9 | station 11 |
| 6 | validation (input) | stations 1–4 | stations 1–4 |
| 7 | confidence scoring | **N/A** — nothing auto-advances; the retry loop gates on a deterministic validator instead of a score | **N/A** — nothing auto-advances, and the write is unconditional |
| 8 | tool selection | station 9, from a closed set that shrinks on regenerate | **N/A** — chains have no tools |
| 9 | tool-call parameter validation | **N/A by construction** — both tools take `z.object({})` and their ids are closure-bound, so there is no model-supplied parameter to validate | **N/A** |
| 10 | pending tool calls | implicit — LangChain drives the agent loop | **N/A** |
| 11 | tool execution | stations 10, 10a | **N/A** |
| 12 | output validation | stations 11 (report-only) + 12 (semantic, enforcing) | station 12 (report-only) + each chain's schema at 8–10 + the read boundary at 14 |
| 13 | fallback behavior | stations 13–14, failure matrix above | station 11 retry + the `[]` degradation at 14, failure matrix above |
| 14 | final response generation | station 15 | station 13 |
| 15 | persistence to the database | **deliberately absent** — see "where an AI result may be persisted" | station 13 |
| 16 | logging and monitoring | `fallback_triggered` at 14, boundary events at 11 | boundary events at 12, `parseStoredConcepts` event at 14 |

---

## Extending this safely

- **A new quizAI tool** is new reach into the database. It needs a row here, a place in the closed
  literal at `quizAI.agent.ts:79`, and a **closure-bound id** rather than a schema argument — both
  current tools read rows with no ownership filter of their own, and they are safe only because the
  id cannot come from the model. `chainContract.contract.test.ts` fails until the row exists.
- **A new lessonInsights chain** needs a row here, a schema in `schemas/lessonInsights.schema.ts`,
  and a decision about `reportModelText`: every model-authored field that gets persisted belongs in
  that list, or the boundary silently stops covering the surface it is credited for.
- **Never widen `StoredConceptSchema` without reading the tutor.** `concepts` is not just study-guide
  content: `lessonAI` builds its `mark_concept_understood` allowlist from it, and the name is written
  verbatim into `ConceptMastery.concept`. The element-length bound at the read boundary is that
  allowlist's last check.
- **Do not make either output boundary enforcing without the number.** Both are report-only on a
  measurement (9.5% and 11.1% false positives, almost all `untrusted_data_echo` from lessons that
  legitimately discuss the wrapper tag), recorded as decision D-M. Enforcement is gated on bringing
  the rate down, not on judgement.
- **Do not feed a quizAI failure back into the prompt.** The semantic violation string is authored by
  our validator and is safe as a hint; an exception message is not, and the boundary verdict at
  station 11 is not either — a per-attempt yes/no would turn the boundary into a hill-climbing oracle
  for the caller who authored the lesson body.