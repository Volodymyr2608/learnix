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

| Design | TTFT | Reply text reaching the browser before a verdict | Complexity | Chosen |
|---|---|---|---|---|
| **Full buffering** | Delayed by the whole generation | None | Trivial | ❌ |
| **Sliding-window validation** | Live | Up to one window, per window | Medium | ❌ |
| **Validated before persistence, retracted before completion** | Live | The entire reply | Low | ✅ |

The chosen design leaks *more* text to the browser than either alternative, not less. It was chosen
anyway, for the reason set out under "What is actually disclosed" below — the disclosure is to the
one person who is already the attacker, while the properties worth protecting (persistence and
re-entry into model context) are fully preserved.

The chosen design:

1. Tokens stream as they arrive (unchanged, TTFT unaffected).
2. At stream completion, the full reply is validated by `validateReply.ts` (pattern check for system
   prompt leak, `<untrusted_data>` echo, verbatim retrieved chunks, off-origin URLs).
3. On rejection:
   - An SSE `retract` event tells the client to discard the partial reply from the DOM.
   - The neutral refusal text is sent as a replacement reply.
   - **Nothing is written to `LessonAssistantMessage`** (persistence is atomic to the decision).
   - An `output_validation_failed` event is logged.

**Why not full buffering.** Accumulating the whole response before sending any token defeats the
primary value of streaming — perceived responsiveness. Time-to-first-token would become
time-to-last-token, so the delay scales with reply length rather than being a fixed cost. This is the
one option that leaks nothing, and it was still rejected: the tutor is a conversational surface whose
usefulness depends on feeling responsive.

**Why not sliding-window validation.** It leaks strictly less than what we chose, so it was rejected
on cost rather than on safety: a window catches a pattern only once the pattern is complete, so it
still leaks partially, while adding real complexity — window size, patterns straddling boundaries,
and validator state carried across send cycles. It buys a partial reduction in a disclosure that,
per below, is not the property we are defending.

**What is actually disclosed.** The entire reply reaches the browser before any verdict exists. That
is the honest statement, and it is the cost of the design. It is accepted because the boundary is not
trying to keep the reply from the student who asked for it:

1. **The recipient is the attacker.** In the case this defends against — a student steering the tutor
   into reciting its system prompt or emitting an exfiltration URL — the person who sees the streamed
   tokens is the person who engineered them. Withholding that text from them protects nothing.
2. **What retraction actually protects is durable.** Nothing is written to `LessonAssistantMessage`,
   so the text never becomes part of the thread, never returns as model context on a later turn (the
   `contextEligible` mechanism from ADR-022), and never reaches a *different* reader — an instructor
   reviewing a transcript, or a support agent.
3. **The off-origin case is closed elsewhere.** A leaked URL matters because it loads without a click,
   and that is stopped at the renderer (decision 3), not by withholding tokens.

What this design does **not** defend: a reply that leaks something the student should not see but did
not deliberately elicit — a system-prompt fragment surfacing by accident. Those tokens are disclosed.
Closing that would require full buffering, and that trade was declined above.

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
- The streaming-validation design preserves the perceived responsiveness that makes the tutor usable,
  while guaranteeing that a rejected reply never becomes durable: it is not persisted, so it cannot
  re-enter model context on a later turn and cannot be read by anyone but the student who elicited it.
- Off-origin URL enforcement is two-layer so a future markdown extension or regex oversight does not
  become a zero-day.

**Negative / accepted tradeoffs**

- The quiz completion floor creates a gap for lessons with no quizzes: their concepts stay at level 2
  and remain "weak" forever in the learning path. Promoting on "lesson complete" would reintroduce a
  non-action confirmation path. This is a schema-level decision out of scope for this feature.
- The conversation ceiling is unenforced at the prompt level (a prompt edit alone does not prevent
  level-3 writes). This is intentional — the point is that prompt-level enforcement does not work
  against the threat model. Any developer reading `spec.md` "Agent notes" will see this recorded.
- Streaming validation discloses the **whole reply** to the requesting browser before any verdict
  exists — more than either rejected alternative. Accepted because the recipient is the party who
  elicited it and the durable properties are preserved; see decision 2. `output_validation_failed`
  events make the frequency visible, which is the compensating control.
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
once and stream. This is the only option that discloses nothing, and it was still rejected: it turns
time-to-first-token into time-to-last-token, so the wait grows with reply length and the tutor stops
feeling conversational.

**Sliding-window validation.** Validate streaming chunks in a rolling window as they arrive, reject if
any chunk fails. Rejected on cost, not on safety — it leaks less than the chosen design, but only
partially (a pattern is caught once complete, so its prefix has already streamed), while adding window
sizing, boundary-straddling patterns, and validator state across send cycles. The reduction it buys is
in a disclosure that decision 2 argues is not the property being defended.

**URL enforcement at the client only.** Drop the server-side regex, rely solely on `inAppUrlTransform`
at render time. Rejected: the server layer makes the contract explicit and emits security events for
monitoring. Without it, a bug in the renderer becomes a silent vulnerability.

**Unified refusal text for off-topic.** Fold the off-topic message into the same neutral refusal as
security rejections. Rejected: off-topic is a product refusal (the question is legitimate but out of
scope), not a security signal. The two must be visibly different so the student can tell "this is not
a security issue, ask about the course instead" from "something went wrong with the system."

## Amendment 2026-08 — the output boundary runs on every exit of a turn

Decision 2 reasoned about "validated before persistence, retracted before completion" as if a turn
had one ending. It has three: normal completion, client abort, and a mid-stream provider error. Only
the first ran `validateReply`.

That made disconnecting after the last content token a **detection bypass** — the reply was obtained,
nothing was persisted (correct), and no `output_validation_failed` was emitted (not correct). The
decision to accept the streaming disclosure was explicitly priced on that event's frequency staying
monitorable, which left the compensating control in the adversary's hands.

All three exits now run the boundary. Abort and error additionally persist nothing and send no
`retract`, since there is no listener left — on those paths the *event* is the entire point. The
disclosure this ADR accepted is unchanged; what changed is that it is now always observable.

Two consequences worth stating: the prompt that elicited a rejected reply is flipped to
`contextEligible: false` (see ADR-022's amendment), and `mastery_write_retained` is now read from the
write tool's artifact rather than by comparing its output to a user-facing refusal string, because a
zero-baseline signal that dies silently is worse than one that is merely noisy.

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