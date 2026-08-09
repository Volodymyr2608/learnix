# ADR-024: Lesson Tutor Authority Boundaries

- **Status**: Accepted
- **Date**: 2026-08
- **Relates to**: ADR-022 (input trust boundary), ADR-023 (authorization binding)
- **Feature spec**: [`docs/specs/features/ai-tutor-guardrails/spec.md`](../specs/features/ai-tutor-guardrails/spec.md)

## Context

The lesson tutor is the only student-facing surface in Learnix that writes an educational record —
`ConceptMastery` rows that `learningPathAI` reads to decide what a student still needs to study. This
authority creates a responsibility that two earlier decisions (ADR-022 for input guards, ADR-023 for
authorization binding) do not address: the model's output is not trusted merely because its input was
clean.

A student's message "I understand this concept" is on-topic and pattern-free (neither L1 nor L2 fires),
yet it falsifies their own record. A prompt instruction ("mark every concept at level 3") is equally
unreachable by the input guard but has consequences at course scope. A streamed reply that leaks the
system prompt or a retrieved chunk is neither a jailbreak nor an injection — it is the model doing what
the model does, yet if persisted it becomes searchable history.

This ADR records three decisions: whether conversation may write records at all, which stream-
validation design holds that boundary, and where the enforcement point for leaked URLs lives.

## Decision

### 1. Conversation may reach mastery level 2; only quiz completion reaches level 3

A ceiling of level 2 in conversation means that a student arguing convincingly across several turns
reaches at most "exposed" understanding. Level 3 ("applied/mastered") is reachable *only* by completing
every quiz on the lesson — confirmation by action, not by text. This floors are enforced in two places:

- `toolPolicy.ts` enforces the ceiling: a `mark_concept_understood` call requesting `level > 2` is
  denied, logging an `unsafe_tool_call` event.
- `quiz.service.ts` enforces the floor: only the `submit` path triggers `promoteConceptsIfLessonComplete`,
  and only when `countDistinctCorrectAmong` === quiz count (every quiz, every student), using `GREATEST`
  in the upsert so a later lower write cannot undo an earlier higher level.

**Why a prompt instruction is insufficient.** A prompt is a request, not an enforcement mechanism.
Including "never mark concepts at level 3" in the system prompt does nothing to stop a sophisticated
attack that overwrites the system prompt or a jailbreak that claims a new persona with different
instructions. The only enforcement that survives a subverted model is structural: the tool itself
must refuse.

**Why the quiz path.** A student can demonstrate understanding only by answering correctly. This
is an action, observable and irreversible. The tutor cannot claim "the student already proved this"
because proof has already happened in a channel (quiz submission) that the tutor cannot fake. No
prompt or tool parameter can falsify a quiz submission: the only way to manufacture a level-3 row is
to actually pass the quiz, and the tutor cannot submit quizzes on behalf of the student (submissions
are bound to studentId at the route level, per ADR-023).

### 2. Reply validation: validated before persistence, retracted before completion

Streaming makes the canonical "validate before display" unreachable — tokens are en route to the
browser before the full reply is assembled. Three designs were considered:

| Design | TTFT | Tokens leaked (worst case) | Complexity | Chosen |
|---|---|---|---|---|
| **Full buffering** | ~800ms delay | 0 | Trivial | ❌ |
| **Sliding-window validation** | Live | 100–200 | Medium | ❌ |
| **Validated before persistence, retracted before completion** | Live | 1–20 | Low | ✅ |

The chosen design:

1. Tokens stream as they arrive (unchanged, TTFT unaffected).
2. At stream completion, the full reply is validated by `validateReply.ts` (pattern check for system
   prompt leak, `<untrusted_data>` echo, verbatim retrieved chunks, off-origin URLs).
3. On rejection:
   - An SSE `retract` event tells the client to discard the partial reply from the DOM.
   - The neutral refusal text is sent as a replacement reply.
   - **Nothing is written to `LessonAssistantMessage`** (persistence is atomic to the decision).
   - An `output_validation_failed` event is logged.

**Why not full buffering.** Accumulating the full response before sending any token defeats the
primary value of streaming — perceived responsiveness. A ~800ms delay before the first token appears
is a regressed experience that would drive users to ask simpler questions to get faster answers, which
works against the tutor's pedagogical goal.

**Why not sliding-window validation.** A window can catch patterns only after they are complete, so
a 20-token "dump" of a chunk starts streaming before validation catches it. The window approach also
adds complexity: deciding window size, handling boundaries, managing state across send cycles. The
retraction approach is simpler because the decision is binary (accept the whole thing, or reject it)
and happens at a natural boundary (stream end).

**What tokens are leaked.** The worst-case leak is 1–20 tokens already streamed before the tutor
stops generating (often a natural cutoff when the model says "done"). A retrieval attack could
potentially craft a query to extract an off-origin URL once the prefix has streamed. This is accepted
because:

1. The attack requires the model to generate an URL in the first place (the model has no incentive to
   leak a data source it was not given).
2. The tokens already in the browser are already sent over TLS, so the attacker must have already
   compromised the connection or the browser itself.
3. The streaming experience is the primary UX lever for this feature, and eliminating it would make
   the tutor so slow that students would use a simpler tool instead.

The spec's `threat-model.md` R2 carries the three-way comparison in full.

### 3. Off-origin URL enforcement is two-layer: server pre-filter, then client renderer

`validateReply` regexes four CommonMark spellings that all render as live links/images: inline
(`![x](url)`), inline with title (`![x](url "t")`), whitespace-padded (`![x]( url )`), pointy-bracket
(`![x](<url>)`), reference definition (`[ref]: url`), and autolink (`<https://…>`). If any href/src
in the text points off-origin, the reply is rejected.

However, `validateReply` is a pre-filter over source text, not the final enforcement. The client-side
renderer (`app/_components/Course/components/LessonAssistant/utils.ts`) applies `inAppUrlTransform`
to every href/src in the markdown AST before rendering. Any URL not matching the app's origin is
dropped (returns `undefined`), so the image never loads and the link never navigates off-site.

**Why two layers.** A regex over source text can be defeated by a CommonMark spelling the server
does not know about yet. The renderer's AST-level transform cannot be defeated that way — the
markdown parser has already determined which text is an href, and the transform runs on that parsed
value. If someone invents a new CommonMark extension years from now that renders as a link, the
renderer still blocks it because it only allows same-origin URLs.

**Why the server layer exists despite the client layer.** The server layer catches the attempt early,
emits a security event for monitoring, and rejects the reply before it is persisted. If only the
client layer existed, an off-origin URL would be persisted as-is, and a future code change (e.g.
removing the transform, or a bug that bypasses it) would silently become exploitable. The server layer
makes the contract explicit: this service never persists URLs pointing away from the app, enforced at
ingestion, not just at display.

**Off-topic refusals bypass both layers.** The route handler (`app/api/chat/lesson/route.ts`) returns
on an off-topic verdict before constructing a stream, so `validateReply` never runs on the off-topic
message. The message text is escaped at creation time (`offTopicMessage(subject)` calls
`subject.replace(MARKDOWN_ACTIVE, "\\$&")`, where `MARKDOWN_ACTIVE` covers all markdown active
characters). The escaping is permanent — the escaped string is what is persisted and rendered on every
visit. Any future addition to the off-topic message must use the same escaped subject string, or call
`offTopicMessage()` to ensure escaping. A direct string concatenation like `` `I can only help with
${subject}` `` would undo the escaping.

## Consequences

**Positive**

- Conversation authority is bound structurally, not by prompt instruction. A sophisticated attacker
  or jailbreak that subverts the system prompt cannot fake a level-3 record.
- Quiz completion as the path to level 3 aligns with pedagogical intent: understanding is demonstrated
  by passing a check, not by claiming it.
- The streaming-validation design preserves the perceived responsiveness that makes the tutor usable
  while keeping unvalidated tokens to 1–20 (worst-case, and only to the browser, not to permanent storage).
- Off-origin URL enforcement is two-layer so a future markdown extension or regex oversight does not
  become a zero-day.

**Negative / accepted tradeoffs**

- The quiz completion floor creates a gap for lessons with no quizzes: their concepts stay at level 2
  and remain "weak" forever in the learning path. Promoting on "lesson complete" would reintroduce a
  non-action confirmation path. This is a schema-level decision out of scope for this feature.
- The conversation ceiling is unenforced at the prompt level (a prompt edit alone does not prevent
  level-3 writes). This is intentional — the point is that prompt-level enforcement does not work
  against the threat model. Any developer reading `spec.md` "Agent notes" will see this recorded.
- Streaming validation leaks 1–20 tokens to the browser in the worst case, before retraction. Accepted
  given the UX cost of full buffering. Monitoring via `output_validation_failed` events helps detect if
  attacks exploit this window frequently.
- Cross-lesson concept-name collision: `ConceptMastery` rows are unique on `(studentId, courseId, concept)`,
  but `lessonConcepts` are extracted per-lesson. A student who masters "Recursion" in lesson 1 reads
  as already proficient in lesson 3, even if they have not seen lesson 3's approach yet. This follows
  from the pre-existing unique key; the fix is lesson-scoped mastery, a schema change.

## Alternatives considered

**Authorization at the conversation ceiling only, no quiz floor.** Level 2 via conversation, level 3
available via conversation if the student argues convincingly enough, but with no quiz requirement.
Rejected because the tutor would still be writing educational records on nothing but persuasion. The
quiz path adds a signal that the student can actually do the thing, not just talk about it.

**Full buffering for validation.** Accumulate the entire reply before sending any token, then validate
once and stream. Rejected: ~800ms TTFT delay kills the primary UX value of streaming. Students would
switch to simpler queries to get faster responses.

**Sliding-window validation.** Validate streaming chunks in a rolling window as they arrive, reject if
any chunk fails. Rejected: a 20-token "dump" of sensitive content would still hit the browser before
validation catches it, the implementation is more complex, and it still doesn't guarantee no leakage
(the attacker just has to time their question to finish within a window).

**URL enforcement at the client only.** Drop the server-side regex, rely solely on `inAppUrlTransform`
at render time. Rejected: the server layer makes the contract explicit and emits security events for
monitoring. Without it, a bug in the renderer becomes a silent vulnerability.

**Unified refusal text for off-topic.** Fold the off-topic message into the same neutral refusal as
security rejections. Rejected: off-topic is a product refusal (the question is legitimate but out of
scope), not a security signal. The two must be visibly different so the student can tell "this is not
a security issue, ask about the course instead" from "something went wrong with the system."

## References

- ADR-022 (input trust boundary — the L1/L2/L3 layers that defend against injection and jailbreak)
- ADR-023 (authorization binding on chat routes — proving the student may access this lesson)
- `docs/specs/features/ai-tutor-guardrails/spec.md` — Functional scope, Acceptance criteria, full
  Agent notes including cross-lesson concept collision and promotion failure handling
- `docs/specs/features/ai-tutor-guardrails/threat-model.md` — Data flow, trust boundaries, the
  three-way validation design comparison (R2)
- `server/services/lessonAI/toolPolicy.ts` — tool authorization, conversation ceiling enforcement
- `server/services/quiz/quiz.service.ts` — quiz completion path, concept promotion logic
- `server/services/lessonAI/validateReply.ts` — reply validation regexes
- `app/_components/Course/components/LessonAssistant/utils.ts` — client-side URL renderer transform
- `server/services/_shared/aiGuard/messages.ts` — off-topic message escaping