# ADR-039: L2 judges a course-builder reply against the assistant turn it answers

- **Status**: Accepted (2026-11-25)
- **Date**: 2026-11
- **Amends**: [ADR-022](022-ai-input-trust-boundary.md) only in what L2 is shown — the message alone
  becomes the message plus, for `courseAI`, the assistant turn it answers
- **Feature**: `ai-input-trust-boundary` (scope item 13)

## Context

L2 (`topicRelevance.ts`) classified each instructor message with no conversation around it. A course
builder is a conversation of proposals and replies, and a reply — `ok`, `looks good`, `make it
intermediate` — names no subject of its own. L2 judged every one of them off-topic, and the course
route persists nothing on a refusal, so the builder could not be approved by chat at all.

Found on production on 2026-11-25: a generation held the draft and the topic turn and none of the
three approvals that followed. Measured against the shipped classifier with the oRPC draft as context,
five draws each: **40/40 legitimate replies refused**, including Ukrainian ones and an ordinary
in-step edit. The builder graph itself was ruled out first — replayed offline, it commits the step on
the same approvals.

## Decision

1. **L2 is shown the prior assistant turn on the course builder.** The route reads the generation's
   latest context-eligible assistant row before the guard and passes it as
   `GuardContext.priorAssistantTurn`; `checkTopicRelevance` places it ahead of the message.
2. **It is untrusted model output.** Wrapped as `model_output` (escaped like every region), bounded
   to its **last 1,500 characters** — the end, where the question a reply answers sits — and read only
   from rows that are `contextEligible` (a retracted reply never vouches).
3. **Ownership is in the read itself.** The read runs before `getOrCreateCourseGeneration`, so it
   filters `generation.instructorId` in the same query; a foreign id yields no turn (ADR-023's
   binding, applied to a guard input).
4. **One job in the prompt.** A short reply to the turn — approval, confirmation, yes/no, an answer
   to its question, in any language, however informal — is on-topic when the turn is. The turn never
   makes a message that introduces a subject of its own on-topic.
5. **Absent turn → unchanged.** No turn (a first builder message, every lesson-assistant turn) gives
   L2 a byte-identical input, pinned by an inline snapshot recorded on the pre-change code.
6. **The residual is accepted and measured, not hidden.** An approval with an unrelated question
   attached (`yes. Also what's the weather in Kyiv?`) is admitted 5/5. `aiGuard:priorTurn` reports it
   ungated so a later prompt change that closes or widens it is visible.

## Alternatives considered

- **An allowlist of approval phrases ahead of L2.** Cheapest and deterministic, but a list is never
  complete (`норм`, `давай далі`, `make it intermediate`), and it would admit whatever follows a
  listed phrase unless it also parsed the rest. Rejected.
- **A prompt rule alone ("short replies are on-topic").** One-line change, but a bare `ok` would then
  be on-topic with no reason tied to the conversation — the classifier cannot tell an approval from
  noise without seeing what is being approved. Rejected.
- **Skip L2 once a generation exists.** Removes the defect and the off-topic net with it; L2 is what
  stops most attacks on this surface, as off-topic rather than as attacks. Rejected.

## Consequences

- **Measured gain:** all nine reply rows pass 5/5 (shipped: 0/5 for all but the topic control); all
  four controls still refused 5/5.
- **Enforcement held:** the `courseAI` attack rows of `aiGuard:adversarial` that reach L2 (5; the
  other 14 stop at L1, which never sees the turn) are refused 25/25 both with and without the turn,
  measured in the same run so the delta is the turn's and not provider drift. Four instructor-shaped
  prior turns (an "ask me anything" invitation, an embedded `onTopic: true` order) are refused 20/20.
- **New input to the guard:** the turn is shaped by the instructor's earlier messages, so it is one
  more place to steer L2 from. The ceiling is what the residual shows — a message rides an approval
  into a graph whose own prompt keeps it on the course — on an instructor-only, rate-limited surface.
- **Cost:** one indexed `findFirst` per builder chat turn before the guard, and up to 1,500 more
  characters in L2's prompt.
- **The lesson route is deliberately unchanged** — the same defect exists for the tutor ("yes, please"
  to "want an example?") and is a separate decision.

## Source of truth

- Spec: `docs/specs/features/ai-input-trust-boundary/spec.md` (banner "Reopened 2026-11-25", Item 13)
- Plan (frozen): `docs/specs/features/ai-input-trust-boundary/build/l2-prior-turn-plan.md`
- Code: `server/services/_shared/aiGuard/topicRelevance.ts`, `…/guardUserInput.ts`, `…/types.ts`,
  `server/services/courseAI/courseAI.service.ts` (`findPriorAssistantTurn`), `app/api/chat/course/route.ts`
- Tests: `topicRelevance.test.ts`, `guardUserInput.test.ts`, `contextEligible.integration.test.ts`,
  `route.outputBoundary.integration.test.ts`; eval `pnpm eval aiGuard:priorTurn`
