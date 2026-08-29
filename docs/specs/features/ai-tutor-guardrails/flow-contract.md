# Lesson tutor — flow contract

The station-by-station contract for the lesson tutor, the counterpart to
[`ai-flow-contracts/graph-contract.md`](../ai-flow-contracts/graph-contract.md) for the two LangGraph
flows. `flowContract.contract.test.ts` fails CI if a tool or a step module exists without a row here,
so this file cannot silently fall behind the code.

**Why it is a separate document, and shaped differently.** The tutor is a **ReAct chain, not a
graph**. `ai-flow-contracts` excluded it deliberately (its `spec.md` Out of scope: "chains, not
graphs, with no node contract to document") and that was right for *that* feature, whose subject was
the node contract. A chain has no registered nodes and no state channels, so "Reads / Writes / Edges"
has nothing to fill in. What it has instead is a linear pipeline of **stations**, each with an input,
an output, and a failure mode — and those are documentable to the same standard. See
[`spec.md`](spec.md) for the design and [`security.md`](security.md) for the control register.

## Stations

Read top to bottom: this is one turn, from HTTP request to persisted row.

| # | Station | Where | Purpose | In | Out | Validation | Model | Failure |
|---|---|---|---|---|---|---|---|---|
| 1 | session check | `app/api/chat/lesson/route.ts:22` | reject anonymous callers | cookie session | `session.user` | — | none | `401`, nothing persisted |
| 2 | rate limit | `route.ts:27` `checkAiRateLimit` | bound per-user model cost | `userId`, feature | pass/deny | — | none | `429`; **fails closed** when the store is unavailable (ADR-027) |
| 3 | body validation | `route.ts:31` `LessonChatBodySchema` | reject malformed input before any DB read | request JSON | `{ lessonId, message }` | Zod | none | `400`, nothing persisted |
| 4 | length check | `route.ts:38` `validateMessageLength` | bound prompt size | `message` | boolean | length ceiling | none | `413` |
| 5 | enrollment check | `route.ts:41` | current entitlement, not historical — an unenrolled or refunded student keeping tutor access is a paywall bypass at our model cost | `studentId`, `lessonId` | `enrollment` with course + lesson | ownership query (ADR-023) | none | `403`; the query that authorizes is the query that acts |
| 6 | **input guard (L1+L2)** | `route.ts:83` `guardUserInput` | injection patterns, then topic relevance | `message`, domain description | `allowed` / `blocked` / `off_topic` | L1 regex set, L2 relevance call | L2: `gpt-4o-mini` | L2 outage **fails open** to `allowed` — L1 still applies (accepted risk, `security.md` S13) |
| 7 | guard exits | `route.ts:113`, `:121` | refuse without feeding the model | guard outcome | one-shot SSE event | — | none | **blocked: persists nothing** — a stored payload replays as trusted history next turn. **off_topic: persists both rows with `contextEligible: false`** so the refusal survives a reload but never returns to the model |
| 8 | context read | `lessonAI.service.ts:60` | load history + concept list in parallel | `lessonId`, `studentId` | `history`, `lessonInsights` | eligibility filter in `getContextMessages` | none | propagates |
| 9 | persist user turn | `lessonAI.service.ts:69` | record the turn | `userMessage` | `userRow.id` | — | none | propagates. **After** the context read, never before: `getContextMessages` returns the newest eligible rows, so saving first replays this turn into its own history |
| 10 | concept allowlist | `lessonAI.service.ts:77` | build the tool allowlist from extracted concepts | `lessonInsights.concepts` (LLM-generated JSON, no schema) | `string[]` | type filter on each entry | none | a non-string entry would throw inside the policy's `trim()`, turning a denial into an unhandled error — hence the filter |
| 11 | **prompt construction** | `lessonAI.agent.ts:15`, `:61`, `:89` | assemble the system prompt | `SYSTEM_PROMPT`, titles, concepts | agent system prompt | titles and concepts go through `wrapUntrustedContent` + `UNTRUSTED_DATA_CLAUSE` | none | function replacers, not strings: a title containing `$'` would otherwise expand past the wrapper into system-prompt position |
| 12 | agent construction | `lessonAI.agent.ts:72` `createLessonAgent` | bind the closed tool set | four `build*Tool` factories | `ReactAgent` | tool array is a **closed literal** — an unregistered name is unrepresentable, not merely rejected | `gpt-4o-mini`, t=0.4, streaming | propagates |
| 13 | model invocation | `lessonAI.service.ts:101` `traced` → `streamEvents` | run the ReAct loop | history + current message | event stream | `recursionLimit: 12` | `gpt-4o-mini` | exceeding the limit throws → station 20 |
| 14 | tool selection | inside the ReAct loop | the agent chooses a tool | model decision | tool call | closed set (station 12) | `gpt-4o-mini` | there is **no separate classifier node** — this is the chain's answer to intent classification |
| 15 | `retrieve_lesson_context` | `tools/retrieveLessonContext.tool.ts` | fetch chunks of this lesson | `lessonId` (bound at construction) | lesson text | id bound server-side, not model-supplied | embeddings | output is untrusted; it lands in `retrievedContent` for station 19 |
| 16 | `search_across_course` | `tools/searchAcrossCourse.tool.ts` | find where a topic was covered | `courseId` (bound) | lesson names + text | id bound server-side | embeddings | as above |
| 17 | `get_student_progress` | `tools/getStudentProgress.tool.ts` | personalise to what the student has seen | `studentId`, `courseId` (bound) | progress summary | ids bound server-side | none | read-only |
| 18 | **`ask_concept_check`** | `tools/askConceptCheck.tool.ts` → `toolPolicy.ts` `authorizeAskConceptCheck` | the tool that **authors a question**, and writes nothing at all | `{ concept, question, options, correctOption }` from the model | the check **buffered on `TutorTurnState`** — no row | `authorizeAskConceptCheck`, first failing rule wins: empty allowlist → *decline*; concept not allowlisted → deny; turn not grounded → deny; question length; option count; option length; option markup; options not distinct; correct option not offered; question reveals answer. Zod validates *shape*; this validates whether the call may proceed at all | none | two denial classes: adversarial → `unsafe_tool_call` + `NEUTRAL_REFUSAL_MESSAGE`; benign → `tool_call_declined` + an explanatory result. The tool result is a bare acknowledgement, so the answer key never re-enters the model's context |
| 19 | **output boundary** | `lessonAI.service.ts:127` `runOutputBoundary` → `validateReply.ts:74` | fail-closed check over the assembled reply | `fullReply`, `retrievedContent` | `{ valid }` or `{ valid: false, ruleId }` | `system_prompt_echo` → `untrusted_data_echo` → `verbatim_chunk_echo` → `off_origin_link`, in that precedence | none | **a validator that throws is a rejection**, logged as `validator_error` |
| 20 | early exits | `lessonAI.service.ts:173` `finishWithoutDelivery` | abort, mid-stream error, consumer abandonment | `fullReply` so far | security events | runs station 19 | none | idempotent; reachable from the in-loop check, the `catch`, and the `finally` — the `finally` is what actually closes the abandonment bypass |
| 21 | retract | `lessonAI.service.ts` | tokens already left; nothing enters the thread or future context | rejection `ruleId` | `retract` event with `NEUTRAL_REFUSAL_MESSAGE` | — | none | the turn leaves **no artifact**: the buffered check is discarded unwritten, and mastery is not written by a turn at all any more. `mastery_write_retained` was retired with the coupling it measured |
| 22 | retire prompt | `lessonAI.service.ts:150` `retireRejectedPrompt` | flip the eliciting prompt out of model context | `userRow.id` | `contextEligible: false` | — | none | **never allowed to abort the turn** — letting it throw would take the security event and the retraction down with it |
| 23 | **persist assistant turn** | `lessonAI.service.ts` | the only write of model text, and where the buffered check is committed | `fullReply`, `toolCallsSummary`, `turn.pendingCheck` | `LessonAssistantMessage` row + `ConceptCheck` row | reached **only** when station 19 returned valid; `toolCalls` is built by a per-tool field allowlist, default-deny | none | propagates |
| 24 | security logging | `logSecurityEvent` throughout | detection without storing payload text | feature, userId, layer, outcome, ruleIds | log event | — | none | events carry rule ids and scores, **never the message text** |

### The answer path is out of band, and that is the design

Stations 1–24 describe one streamed turn. Answering a check is **not** part of one: it is a separate
tRPC mutation, on a separate request, with no model in it anywhere.

| # | station | module | purpose | input | output | validation | model | failure |
|---|---|---|---|---|---|---|---|---|
| A1 | `lessonAssistant.pendingCheck` | `conceptCheckRepository.findPendingPublic` | show the student the question waiting for them | `studentId`, `lessonId` | `ConceptCheckPublic` or null | explicit column list; `correct` is not selected, and expiry is compared against the database clock | none | null when absent, answered, or expired — the three are indistinguishable |
| A2 | `lessonAssistant.answerConceptCheck` | `conceptCheck.service.ts` `answer()` | grade, once | `{ checkId, optionIndex }` | `{ isCorrect, correctOption }` | the claim's `WHERE` asks every authorising question at once — id, owner, `PENDING`, unexpired, live enrollment | none | absent / foreign / answered / expired all raise one `CheckUnavailableError` with one message: four causes, no oracle |
| A3 | the write of authority | `conceptCheckRepository.claimForAnswer` + `conceptMasteryRepository.upsertMastery` | record level 2 with `APPLIED_CHECK` | the **claimed row**, never the request | `ConceptMastery` upsert | claim and write share one transaction, so a failed write leaves the check `PENDING` and no row | none | grading is string equality against the stored option text; no index into the authored array is ever consulted |

## Where an AI result may be persisted

Two writes, two different rules, and the asymmetry is deliberate:

- **Model text** (station 23) is persisted **only after** the output boundary passes. A rejected
  reply is retracted, not stored — the tokens already reached the browser, but nothing enters the
  thread or the model's future context.
- **The educational record** (station 18) is persisted **when its own authorization passes**, before
  the reply exists. It is not coupled to the reply text, so a later retraction does not undo it;
  instead `mastery_write_retained` correlates the two so a human can review a turn adversarial
  enough to be retracted that still wrote to a mastery record.

## Failure matrix

| Scenario | System behavior | What the student sees | Persisted |
|---|---|---|---|
| L1 pattern hit (`blocked`) | one-shot SSE, no model call | neutral refusal | **nothing** |
| L2 says off-topic | one-shot SSE, no model call | neutral refusal | both rows, `contextEligible: false` |
| L2 provider outage | **fails open** to `allowed`; L1 still applied | normal answer | normal |
| Rate-limit store unavailable | **fails closed** | `429` | nothing |
| Tool authorization denied | tool returns the neutral refusal, writes nothing | the model answers around it | no mastery row |
| Recursion limit (12) exceeded | throws → `catch` → station 20 | "Something went wrong" | no assistant row |
| `validateReply` rejects | retract | neutral refusal replaces the streamed text | no assistant row; prompt retired |
| `validateReply` **throws** | treated as a rejection (`validator_error`) | as above | as above |
| Mid-stream provider error | station 20, then neutral error | partial text then "Something went wrong" | no assistant row |
| Client aborts / abandons the stream | station 20 via the `finally` | nothing | no assistant row; events still emitted |

## The brief's sixteen flow steps, mapped

The Area-3 brief lists sixteen steps an AI flow should document. Three are **absent by design**, and
knowing *why* a step is missing matters more than having it.

| # | Step | In the tutor? | Where |
|---|---|---|---|
| 1 | intent classification | **N/A** | a graph step (`courseAI/graph/nodes/classifyIntent`). The ReAct agent picks its own tool (station 14); there is no classifier to document |
| 2 | extraction of structured step data | **N/A** | a graph step (`courseAI/.../extractStepData`). The tutor produces prose, not a structured record to extract |
| 3 | context preparation | yes | stations 8–10 |
| 4 | prompt construction | yes | station 11 |
| 5 | model invocation | yes | station 13 |
| 6 | validation (input) | yes | stations 3–6 |
| 7 | confidence scoring | **N/A** | a graph step (`courseAI/.../confidenceScore`, threshold 0.8). The tutor auto-advances nothing and persists no extracted field, so there is no decision for a confidence score to gate. Its equivalent guard is the output boundary, which is a rule check rather than a score |
| 8 | tool selection | yes | station 14 |
| 9 | tool-call parameter validation | yes | station 18 — and this is the strong one: authority, not just shape |
| 10 | pending tool calls | implicit | LangChain drives the loop; there is no `pendingToolCalls` channel to inspect, which is exactly the difference from the graph |
| 11 | tool execution | yes | stations 15–18 |
| 12 | output validation | yes | station 19 |
| 13 | fallback behavior | yes | stations 20–22, failure matrix above |
| 14 | final response generation | yes | station 13 (streamed) |
| 15 | persistence to the database | yes | stations 9, 18, 23 — and "Where an AI result may be persisted" above |
| 16 | logging and monitoring | yes | station 24 |

## Extending this safely

- **A new tool** is new authority. It needs a row here, a place in the closed literal at
  `lessonAI.agent.ts:74`, an entry in `ALLOWED_TOOL_NAMES`, and — if it writes anything — an
  authority check beside `authorizeMarkConceptUnderstood`, not just a Zod schema. `pnpm classify`
  reports it as new authority (ADR-030) and `flowContract.contract.test.ts` fails until the row
  exists.
- **A new output rule** belongs in `_shared/aiOutput` if it is surface-independent, and in
  `validateReply` only if it needs this turn's retrieved chunks — that is the one thing the shared
  boundary cannot see.
- **A new early exit** must call `finishWithoutDelivery`, or it becomes a detection bypass: a reply
  that reached the browser without emitting its security events.