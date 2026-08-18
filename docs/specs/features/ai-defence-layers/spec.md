---
feature: ai-defence-layers
status: stable
models: [CourseGenerationMessage]
depends-on: [ai-input-trust-boundary, ai-tutor-guardrails, ai-chat-route-authorization]
---

## Purpose

`ai-input-trust-boundary` made the **input** side of every AI surface shared: one guard module, one
wrapper, five services that call them. Nothing did the same for the other boundaries. Authority (L4),
output validation (L5), render policy (L6), resource limits (L7) and detection (L8) were all built
during `ai-tutor-guardrails`, and all of them live inside `server/services/lessonAI/`.

The result is a system where the tutor is defended and the other four surfaces are defended by
accident of what happened to be factored out. `docs/security/2026-08-16-ai-content-supply-chain.md`
Part II measures it: of five model-calling surfaces, one has an output boundary, one has a render
policy, two are covered by a rate limiter, and **three cannot emit a security event at all** because
`SecurityEvent.feature` is typed to the two chat callers of the input guard. The same defect repeats
one layer down: `AiRateLimitFeature` omits `quizAI` and `lessonInsightsAI`, so those two surfaces
cannot be rate-limited by type either.

The difference between the tutor and the rest is not a threat-model decision. It is where the folder
boundary fell. This feature moves those boundaries into `_shared`, gives every AI surface the same
stack, and makes per-surface coverage a test rather than a document — so the sixth AI surface
inherits the layers instead of rediscovering them.

Scope note: this feature covers the *layers*. Two findings from the same review that are content
defects rather than missing layers — the quiz answer key (C4) and instructor content length caps
(C5, except the URL fields this feature already edits) — are out and get their own specs. C7
(quizAI's error-string hint) is pulled **in**, because this feature adds telemetry to that exact
fail-open and telemetering it while it still feeds exception strings back into a prompt would be
worse than leaving both alone.

## Functional scope

**1. A shared output boundary (`server/services/_shared/aiOutput/`).**
`validateModelText(text, ctx)` performs the three surface-independent checks currently inside
`lessonAI/validateReply.ts`: system-prompt leak markers, `untrusted_data` tag echo, and off-origin
link destinations. Design constraints that make the extraction real rather than nominal:

- The leak markers are a **total per-`AiFeature` registry** living in `_shared/aiOutput/` —
  `Record<AiFeature, readonly string[]>`, with no `?? []` fallback. The tutor's four markers are
  English phrases from the tutor's own prompt; one global list would give the other four surfaces a
  check that is green in the matrix and empty in fact, and a `Partial` record with a fallback is the
  same defect one level down — surface number six would get silent zero coverage while the matrix
  still read `applied`. Every one of the five surfaces has a static, distinctive system prompt to
  draw from (`quizAI.agent.ts:13-27`, `concepts.chain.ts:9`, `mergeAndExplain.node.ts:159-167`), so
  an empty set is a choice, not a constraint.
- Markers are pinned **per assembled prompt variant**, not per feature. `chat_response` has four
  prompt branches and the `clarify` node two more; markers covering only the normal branch would
  reproduce, inside courseAI, exactly the per-surface defect this registry exists to kill. The
  contract test asserts both directions — every variant is covered by at least one marker, and every
  marker is a verbatim substring of some variant of its own feature — generalising the assertion
  `lessonAI.agent.test.ts` already makes. Markers must be distinctive: a four-word generic phrase
  like "Do NOT show raw JSON" is rejected, because an ordinary reply saying "I won't show raw JSON
  here" is a plausible false positive.
- `_shared/aiOutput/` imports nothing from `server/services/lessonAI/`.
- The throw→rejection conversion is exported **once**; the raw check functions are not exported, so a
  caller cannot swallow a validator exception because it never sees one.
- Exactly one `logSecurityEvent` per rejected text, carrying the calling feature.

`lessonAI/validateReply.ts` becomes a composition: the shared checks plus its own verbatim-chunk
check, which stays local because it needs `retrievedContent` that only a RAG surface has. The
existing rule precedence is preserved, because S11's thresholds read the `ruleIds` distribution to
name the channel.

**2. courseAI runs the output boundary as a graph node.** `persist_and_emit` is downstream of
`chat_response` *inside the same graph invocation* (`graph.ts:119-136`), so a route-level check is a
race, not a control. The boundary is registered **twice against one implementation** —
`output_boundary` after `chat_response`, `output_boundary_clarify` after `clarify` — because the two
positions have different successors on accept and the routing difference belongs in the edge list,
not in a state flag the node has to read. It is spliced immediately after `chat_response` rather
than before `persist_and_emit` because `extract_step_data` reads `state.assistantText` directly
(`extractStepData.ts:32-38`), so a later placement misses four of the five paths. The invariant is
structural: no path from a streaming node reaches `END` or `persist_and_emit` without traversing a
boundary node. On rejection: no assistant message persisted, **the step is not committed**, the
instructor receives `retract` with `NEUTRAL_REFUSAL_MESSAGE`, and no `done`.

**Enforcement in the graph; emission in the route, unconditionally.** A graph node cannot fire on
client abort or a mid-stream provider error — the two exits where tokens have already reached the
browser. The first design had the route detect whether the node had run and emit only then; that is
a race, because the route's loop checks `abortSignal.aborted` at the top of each iteration and
whether a late node-completion event is observed at all depends on stream buffering. Since "the node
cannot fire on abort" is the reason the route check exists, the route cannot trust a signal from
that node either. So **the graph node is silent** (it computes the verdict to gate the commit and
emits nothing) and **the route re-runs the boundary in a `finally` on every exit and is the sole
emitter**. "At most once per turn, exactly once on rejection" is then true by construction rather
than by coordinating two emitters. The cost is two cheap regex passes twice on a clean turn.

**One durable write precedes the boundary and is not rolled back.** `revise_prior_field` writes
`CourseGeneration.content` before `chat_response` runs (`revisePriorField.ts:71-73`), and the route
has already sent `content_revised`. The write passed its own authorization and stands; a rejected
revise turn emits `content_revised_retained` to correlate the retained side effect with the
adversarial signal — courseAI's analogue of the tutor's `mastery_write_retained` (D-L). The
`finalize` path (`START → extract_step_data → … → persist_and_emit`) traverses no boundary at all
and is declared as a deliberate exclusion in the conformance matrix, not left silent.

**3. The eliciting prompt leaves model context.** `CourseGenerationMessage` gains
`contextEligible Boolean @default(true)`; `hydrateState` filters on it; a turn whose reply was
rejected persists its user message with `contextEligible: false`. Without this, re-asking after a
rejection draws a fresh sample from a stochastic model with the previous attempt replayed as ordinary
history — the tutor's hazard, on the surface where the model's output commits a step. The message
stays visible in the instructor's thread.

**4. Structured free-text fields are validated too.** Model-authored free text inside otherwise
schema-validated output runs through `validateModelText`: `summary` and each step's `reason`
(`learningPathAI`), `summary` / `explanation` / `definition` (`lessonInsightsAI`), `question` and
`options` (`quizAI`). A rejection is **terminal for the whole generation** — it does not consume a
`semanticValidate` retry, does not append to `mergeAndExplain`'s violation feedback, and its reason
never enters a prompt. Feeding a rejection reason back into a retry loop would build a hill-climbing
oracle out of the fix.

Honest limits, stated per rule so the matrix does not over-claim. Because the marker registry is
total (§1), `system_prompt_echo` is live on all five surfaces — but its reach differs by field: a
300-character glossary `definition` will not contain a marker phrase, while `SummarySchema.summary`
(40–800) and `LearningPathSchema.summary` are long enough to carry a recital and are the fields the
rule actually protects. `off_origin_link`, by contrast, guards **no channel** on these three
surfaces: `StudyGuideCard`, `LearningPathCard` and `QuestionCard` render plain React text nodes, not
markdown, so a destination in a `definition` is inert text. The conformance declaration therefore
records L5 **per rule** (`applied` / `n/a` with a reason), never as one value — otherwise quizAI's
row reads identically to the tutor's while one rule is thin and another guards nothing.

A rejection must not be distinguishable by the caller from an ordinary generation failure. On quiz
and insights the caller *is* the author of the lesson body, so a distinct error code would hand them
a clean yes/no per generation on whether their text trips the boundary — a hill-climbing channel for
tuning text that will be delivered to students. All three rejection errors map to the same
client-visible code and message as that surface's existing failure path; the distinction lives in
the security event only.

**5. Telemetry covers all five surfaces.** `AiFeature` is a standalone union —
`courseAI | lessonAI | lessonInsightsAI | quizAI | learningPathAI` — and `SecurityEvent.feature` is
typed on it. `GuardContext.feature` stays narrowed to the surfaces that actually run the input guard.
`SecurityLayer` gains a value for model-call fail-opens, and the two undeclared fail-opens that exist
today start emitting `fallback_triggered`: quizAI's swallowed exception and learningPathAI's terminal
semantic-validation failure. `SecurityEvent` gains a closed, id-only `subject` field, because on
insights/path/quiz the `userId` is the student or instructor who triggered generation and never the
author of the content that tripped the boundary — without it the event is emitted but not triageable.
`SecurityOutcome` gains `content_revised_retained` for the one durable write that precedes the
courseAI boundary (§2).

**6. A shared resource boundary (`server/services/_shared/aiLimits/`).** `aiRateLimit(feature)` is a
tRPC **middleware composed onto existing role procedures**
(`instructorProcedure.use(aiRateLimit("quizAI"))`) — never a standalone base, because a standalone
base is exactly the shape that silently replaces the role check. `AiRateLimitFeature` is derived from
`AiFeature`, so all five surfaces are rate-limitable by type. The aggregate per-user check lives
inside `checkAiRateLimit` itself, not in the middleware, so the raw `app/api/chat/**` routes and the
tRPC surfaces share one aggregate bucket. `learningPathAI`'s private limiter is consolidated into the
shared module.

Four constraints that the first draft of this section got wrong, recorded so they are not
rediscovered:

- **The middleware form cannot be enforced by the type system.** `t.middleware` types its callback
  against the *root* context, so contravariance permits attaching the limiter to `publicProcedure`
  as readily as to `instructorProcedure`. The role composition is enforced by a contract test that
  scans `server/api/routers/**` for every `.use(aiRateLimit(` and asserts the preceding builder is a
  role procedure — a check that scales to procedures nobody has written yet, unlike a list of known
  call sites.
- **The window map is pinned on `globalThis`**, following `server/db.ts:10-16`. Next bundles route
  handlers, the tRPC handler and the RSC server separately, so module-scope state is per bundle
  instance and "one aggregate bucket" would silently become two or three *inside a single process* —
  while every unit test passed, because tests import the module once.
- **One request spends exactly one aggregate slot.** `learningPathAI` checks an aggregate at the
  procedure and a scoped window in the service; without an explicit opt-out on the second call, one
  user action would consume two of the budget. Its per-feature ceiling stays above 1, because the
  1/min rule is *per (student, course)* and lives in the service — the scope cannot travel through
  the middleware, since a limiter key must never derive from input.
- **That scope must be a verified id.** `learningPath.regenerate` currently passes the caller's raw
  `courseId` to the graph with no enrollment check, which is an IDOR in its own right and would also
  make the limiter key attacker-chosen. It gains the enrollment lookup the SSE twin already performs
  (`app/api/chat/learning-path/route.ts:28-34`) and passes `enrollment.courseId` to both.

Every `ChatOpenAI` on a path a user waits on declares `timeout` and `maxRetries`; the courseAI and
learningPathAI graphs declare an explicit `recursionLimit`. Those bound a single call and a single
graph, not a turn — a courseAI turn chains eight nodes, so each graph invocation also carries a
per-turn deadline composed onto the request signal.

**7. A shared render policy (`app/_components/_shared/markdown/urlPolicy.ts`), split by author
trust.** Two transforms, both using react-markdown's real
`(url, key, node) => string | null | undefined` signature — the existing one-argument
`inAppUrlTransform` cannot tell an image from a link and so cannot implement the split at all:

- `modelOutputUrlPolicy` — same-origin for every destination. Applied where a model wrote the text:
  the tutor (behaviour unchanged) and the builder's `ChatMessage`.
- `authoredContentUrlPolicy` — **images must be same-origin, links may be off-origin**. Applied to
  `CourseLearnView`'s lesson body. An off-origin image is a zero-click beacon; an off-origin link
  needs a deliberate click and is a legitimate authoring need. Off-origin anchors carry
  `rel="noopener noreferrer"`.

Both policies apply a positive protocol allowlist before any origin comparison, because overriding
`urlTransform` removes react-markdown's `defaultUrlTransform` — the thing that blocks `javascript:`
and `data:` today.

**The origin comparison must not reach for `window`.** `CourseLearnView` is a client component, but
the page rendering it is an async Server Component, and Next prerenders client components on the
server; react-markdown calls `urlTransform` synchronously during render. A policy reading
`window.location.origin` therefore throws during SSR on the first lesson body containing an absolute
URL — a content-triggered availability failure in the control itself, triggered by an ordinary
instructor link. The app origin resolves through one function usable on both sides, living in a
neutral module (`lib/url/`) rather than the component tree, so that the server-side output boundary
and the client-side render policy cannot disagree about what "our origin" is, and so the lesson DTO
can import the same predicates without pulling `window` onto the server.

`videoUrl` is restricted to an **origin allowlist** (the video providers actually used) rather than a
host allowlist, since `<source src>` is the same zero-click off-origin fetch as an image in the same
component and origin pins the port too. The comparison is exact on the full origin, which is what
closes userinfo (`https://www.youtube.com@evil.example/x`), IDN homographs (WHATWG `URL` normalises
to punycode) and suffix tricks (`youtube.com.evil.example`). It does **not** close a redirect
endpoint on an allowlisted host — `<source>` follows redirects — and that is recorded as a residual
rather than implied away by the matrix. The empty string stays valid, or clearing a lesson's video
becomes impossible.

`resources[].url` is scheme-restricted, matching the link rule — expressed as a **positive**
allowlist, never as a negated off-origin test. A disallowed scheme classifies as *drop*, not as
*off-origin*, so `!isOffOrigin(url)` is true for `javascript:` and a refine built on it accepts
exactly the payload it exists to reject.

**8. Wrapping coverage is verified, not just registration.** A TypeScript-AST contract test walks
every file in `GUARDED_ENTRY_POINTS` **and `EXEMPT_MODEL_CALLERS`** and is **default-deny**: it flags every interpolation not
lexically inside a `wrapUntrustedContent(...)` call unless the identifier is in a small
`TRUSTED_INTERPOLATIONS` list (session ids, enums, counts) or carries an allow entry with a reason. A
"known-untrusted names" registry would be the same registration-vs-completeness failure one level
down — it would not have caught `weakConcepts` unless someone had already noticed `weakConcepts`.
Coverage extends past template literals to object-literal properties passed to `.invoke(` and to
message objects with a `content` key, or the surface with the cleanest wrapping
(`lessonInsightsAI`) would get zero coverage from the test built to verify wrapping.

**Scanning only the registered list would be the same failure one level down.** Six courseAI nodes
sit in `EXEMPT_MODEL_CALLERS`, and their exemption reason covers `state.userMessage` and nothing
else. What is actually in those prompts: `clarify.ts:38-45` interpolates `state.assessClarify` and
`JSON.stringify(state.draftStepData)` — both **model output** — raw into a prompt whose reply is
streamed to the browser, which is the `reflectionFeedback` shape verbatim; `revisePriorField.ts:52-63`
does the same into a prompt whose output is written to the database; `toolRouter.ts:84-92` builds
messages from `...state.messages`, where `search_similar_courses` deposits other instructors' copy.
An exemption is a claim about the *caller*, and the scan honours it per expression through an allow
entry carrying that reason — never through absence from the scan set.

Two instances are fixed as part of this work, both in `mergeAndExplain.node.ts`: `state.weakConcepts`
(line 174) and `state.reflectionFeedback` (line 177) — the latter is a critic model's output entering
another model's prompt. Whatever the widened scan surfaces in the six formerly-exempt nodes is fixed
by wrapping, not by allow-listing.

**`violationFeedback` is made server-authored rather than declared trusted.** `security.md` S2
classes it as "ids + fixed strings", but `semanticValidate` builds its sentences from the *model's*
draft (`duplicate lessonId "${step.lessonId}"`), and `PathStepSchema.lessonId` is an unbounded bare
`z.string()` — so a model steered by poisoned lesson content can carry arbitrary text into the next
attempt's prompt. `semanticValidate` returns a code and a step index; the sentence is assembled
server-side from a fixed table, and the id fields gain a length bound.

**9. Surfaces that run no input guard declare it.** An `UNGUARDED_BY_DESIGN` registry in
`entryPoints.ts` names `quizAI`, `lessonInsightsAI` and `learningPathAI` with the reason — they take
no caller-supplied free text — and a contract test asserts their input DTOs contain no free-text
string field.

**10. courseAI's cross-tenant containment is pinned.** `chat_response` does not read `state.messages`,
which is what keeps another instructor's course titles out of the reply. A comment states this is
deliberate and a contract test asserts it.

**11. `LessonInsights.concepts` is validated at the read boundary — once, for both read paths.**
`lessonInsightsRepository.findByLessonId` parses with `safeParse` and **never throws**: the stored
shape is the concepts *array* (not the `{ concepts: [...] }` wrapper the generation schema describes),
with per-element validation and no cardinality bounds. On failure it returns `concepts: []` and emits
telemetry, and the insights cache treats a parse failure as a miss so regeneration heals a poisoned
row rather than being blocked by it.

This is a bug fix, not a formalisation. On the stored value `{"concepts": "not-an-array"}` at least
three consumers call `.map` on a string and throw a `TypeError` today (`lessonAI.service.ts:80`,
`lesson.repository.ts:36`, and transitively `quiz.service.ts:212`).

**`lesson.repository.listOrderedWithConcepts` reads the column through its own Prisma include and
must use the same schema**, per element, dropping non-conforming entries. Giving it an ad-hoc
`Array.isArray` guard instead would leave two read paths with two validations and the invariant
living in each consumer — the shape G5 exists to remove — and `[{ notName: 1 }]` would survive it,
yielding `[undefined]` into the learning-path prompt.

Dropping the *cardinality* bound at read is correct (3–7 is a generation-time rule). Dropping the
*per-element length* bound is a different decision and is not made: concept names are interpolated
into the tutor's system prompt (`lessonAI.agent.ts:58-66`) and written verbatim into
`ConceptMastery.concept`.

**12. The conformance matrix is a test, and it asserts reachability.** Each AI surface declares which
of L0–L8 apply and which are `n/a` with a reason. Every tRPC procedure whose call graph reaches a
`ChatOpenAI` construction must be composed with `aiRateLimit`; every raw route that does so must call
`checkAiRateLimit`; every renderer must appear in a declared renderer→policy map. A new model-calling
surface with no declaration fails CI.

**13. C7 — quizAI hint hygiene.** Only the validator's own messages are fed back into the retry
prompt; a thrown error retries with no hint and is logged instead.

## Acceptance criteria

Each line is phrased to become a test or eval row directly. `[EVAL]` marks rows belonging in
`evals/`.

**Output boundary (L5) — shared module**
1. `validateModelText` rejects text containing a leak marker for the calling feature and emits
   `output_validation_failed` naming that feature.
2. `validateModelText` rejects text containing `<untrusted_data` in any casing.
3. `validateModelText` rejects an off-origin destination expressed as an inline link, a reference
   definition, or an autolink.
4. The throw→rejection conversion lives once in `_shared/aiOutput`; the raw check functions are not
   exported, and a caller cannot receive a validator exception.
5. Leak markers are a **total** `Record<AiFeature, readonly string[]>` with no fallback; for every
   feature each marker is a verbatim case-insensitive substring of one of that feature's real
   assembled prompt variants, imported not copied. A drifted marker fails CI, and so does a
   *streaming prompt variant* that no registered marker covers — `chat_response`'s four branches and
   the `clarify` node's two are each asserted, not the feature as a whole. A marker shorter than six
   words fails CI as too generic.
6. A feature running `validateModelText` with an empty marker set fails CI. A surface that genuinely
   warrants none declares `system_prompt_echo: "n/a"` **with a reason** in the conformance
   declaration (AC 46) — the same discipline `UNGUARDED_BY_DESIGN` applies to L1/L2. Silence is not
   an option.
7. `_shared/aiOutput` imports nothing from `server/services/lessonAI/`.
8. Exactly one `logSecurityEvent` per rejected text — a tutor rejection emits one event, not two.
9. The composed `validateReply` preserves precedence `system_prompt_echo → untrusted_data_echo →
   verbatim_chunk_echo → off_origin_link`; a reply tripping both the third and fourth reports the
   third.
10. `lessonAI`'s existing rejections are unchanged: an 87-character verbatim run is still
    `verbatim_chunk_echo`.
11. `[EVAL]` `aiOutput:falsePositive` — legitimate instructor content (an AI-security lesson body
    containing the literal `<untrusted_data` **and its escaped form `&lt;untrusted_data`**, the tag
    inside a fenced code block, a lesson quoting attack strings, ordinary bodies with legitimate
    off-origin links) runs through **all five** surfaces including courseAI, **via the real chains**,
    ≥3 samples per row because the event is stochastic. FP rate reported per surface **and per
    rule**, target ≤5%, measured number recorded in `security.md`. **Ships before any fail-closed
    rejection ships** — before AC 14/23/24/25, not merely before the thresholds in AC 33. Running
    `validateModelText` over corpus text directly would measure an event that cannot occur, since
    `wrapUntrustedContent` escapes the tag before the model ever sees it.
12. `[EVAL]` `aiOutput:leak` — per surface, a prompt-recital payload produces a reply
    `validateModelText` rejects; recall reported per surface, not aggregated.

**Output boundary — courseAI**
13. A graph contract test asserts no path from `chat_response` or `clarify` reaches `END` or
    `persist_and_emit` without traversing `output_boundary`.
14. An integration test with a stubbed model returning a leak marker asserts, for one **non-revise**
    turn: zero new assistant rows, `CourseGeneration.step` and `.content` byte-identical, one
    `output_validation_failed`, one `retract` frame, and no `done`. On a **revise** turn the
    prior-field write to `.content` stands — it precedes the boundary and passed its own
    authorization — and emits exactly one `content_revised_retained` (D-L) alongside the retraction.
15. The route runs the boundary from a `finally` over `assistantFullText` **on every exit**,
    unconditionally, and is the sole emitter; the graph nodes run the same check silently. Pinned by
    a test whose consumer `break`s the loop the way the route does, and by a contract test asserting
    only the two permitted callers pass `emit: false`.
16. The event fires **at most** once per turn across the completion, abort, provider-error and revise
    paths, and exactly once when the reply is rejected. A clean turn emits nothing — an ordinary
    client navigation is not a security event.
17. No fallible write sits between the security event and the `retract` frame; a throwing
    `saveMessage` still yields `retract`.
18. The builder client handles `retract` and removes the streamed tokens; an unhandled event type
    fails a contract test.
19. A clean courseAI turn persists exactly one assistant message and commits its step as before.

**Context eligibility (courseAI)**
20. `CourseGenerationMessage.contextEligible` exists with `@default(true)`; `hydrateState` filters on
    it.
21. A turn whose reply was rejected persists its user message with `contextEligible: false`, and the
    next turn's `history` does not contain it.
22. The rejected message is still returned by the instructor-facing thread read.

**Output boundary — structured surfaces**
23. A `learningPathAI` `summary` containing a leak marker is rejected before `upsertPath`.
24. A `lessonInsightsAI` glossary `definition` containing an `untrusted_data` echo is rejected before
    the insights row is written, and the row is not cached — so the next call regenerates.
25. A `quizAI` `question` or `option` containing an `untrusted_data` echo is rejected before quiz
    rows are written.
26. An output rejection is terminal: it does not consume a `semanticValidate` retry, does not append
    to `mergeAndExplain`'s violation feedback, and its reason never appears in a prompt. It is also
    **not distinguishable by the caller** from that surface's ordinary generation failure — same
    client-visible code, same message — because on quiz and insights the caller authored the input.
27. Rejection is whole-generation, never field-level — including glossary entries.

**Telemetry (L8)**
28. `logSecurityEvent` accepts all five `AiFeature` values; a call from `quizAI`, `lessonInsightsAI`
    or `learningPathAI` type-checks and emits.
29. Passing `quizAI` to `guardUserInput` is a type error — `GuardContext.feature` stays narrow.
30. `SecurityEvent.subject` is a closed id-only shape; no `SecurityEvent` field accepts unconstrained
    free text.
31. `SecurityLayer` has a value for model-call fail-opens; quizAI's swallowed exception and
    learningPathAI's terminal semantic-validation failure each emit `fallback_triggered`.
32. A `findByLessonId` parse failure emits telemetry rather than throwing.
33. Thresholds for the four newly-covered surfaces are recorded in `security.md` only after AC 11's
    FP number exists.

**Resource boundary (L7)**
34. `aiLimits` exports a middleware; every call site composes it onto a role procedure.
    `quiz.generateAI` and `lessonInsightsAI.generateLessonInsights` still reject a `STUDENT` with
    `FORBIDDEN`, not `TOO_MANY_REQUESTS`.
35. No export in `_shared/aiLimits` is a procedure builder, and `server/api/trpc.ts` exports the
    middleware factory rather than `t`. The role composition itself is enforced by a contract test
    that scans `server/api/routers/**` for **every** `.use(aiRateLimit(` and asserts the preceding
    builder is `instructorProcedure`, `studentProcedure` or `adminProcedure` — not by a list of known
    call sites, and not by the type system: `t.middleware` types against the root context, so
    contravariance permits attaching to `publicProcedure`. The limitation is recorded in
    `security.md` S12.
36. The middleware runs after session and role checks: 100 anonymous calls leave the window map size
    unchanged.
37. The window key derives from `ctx.session.user.id` only; a `userId`-shaped field in the procedure
    input does not influence it.
38. `AiRateLimitFeature` is derived from `AiFeature`; all five surfaces are rate-limitable by type.
39. The aggregate check lives inside `checkAiRateLimit`, so raw routes and tRPC surfaces share one
    aggregate bucket — a test alternating a raw-route call and a tRPC call exhausts it. The window
    map is pinned on `globalThis`, or route handlers, the tRPC handler and the RSC server each get
    their own bucket inside a single process while every test still passes.
40. Aggregate and per-feature key spaces are disjoint by construction; a feature named `""` cannot
    collide with the aggregate key.
41. Both windows are evaluated before either is incremented: a request rejected by the aggregate
    leaves the per-feature counter unchanged, asserted on the counter itself.
42. Eviction frees space even when no entry is expired; inserting `THRESHOLD + 1` live keys does not
    grow the map unboundedly. No O(1) claim is made: above the threshold every call still runs the
    expired sweep before deciding, and the fallback drop resets roughly five hundred windows at once
    — a fail-open under exactly the load where the ceiling matters, recorded as a residual.
43. `learningPathAI`'s private `rateLimitBucket` is removed; the shared module is authoritative and
    preserves the 1/min per-(student, course) rule.
44. Every `new ChatOpenAI(` on a user-waited path declares `timeout` and `maxRetries` — including
    `mergeAndExplain.node.ts` and `reflectAndCheck.node.ts` — enforced by a source scan.
45. The courseAI and learningPathAI graphs declare an explicit `recursionLimit`; exceeding it yields
    the standard non-retryable error with no exception message reaching the client.
46. The conformance test asserts reachability: a model-calling procedure without `aiRateLimit`, or a
    model-calling raw route without `checkAiRateLimit`, fails CI.
47. Limiter errors carry a fixed message with no window size, remaining count, or reset timestamp.

**Render boundary (L6)**
48. Both policies accept the `(url, key, node)` signature and decide on node kind. The same URL
    string is dropped as an image `src` and preserved as a link `href` under
    `authoredContentUrlPolicy`.
49. `modelOutputUrlPolicy` drops both an off-origin image and an off-origin link.
50. Both policies apply a positive protocol allowlist before any origin comparison; `javascript:`,
    `JaVaScRiPt:`, `data:`, `vbscript:`, `blob:` and `file:` are dropped by both.
51. A contract test asserts no markdown renderer in `app/` enables `rehype-raw` or
    `allowDangerousHtml`.
52. Pinned constructs: image-inside-link drops the image and keeps the link; a reference-style image
    definition is dropped; an off-origin autolink is preserved under `authoredContentUrlPolicy` and
    dropped under `modelOutputUrlPolicy`.
53. Off-origin anchors under `authoredContentUrlPolicy` carry `rel="noopener noreferrer"`.
54. The renderer→policy mapping is a declared map asserted by contract test, so a renderer using the
    *wrong* policy fails, not only one using none.
55. `videoUrl` is validated against a host allowlist at the DTO **and** at render, since the DTO is a
    write control and pre-existing rows were never parsed. A fixture row with an off-allowlist host
    puts nothing in the attribute.
56. `resources[].url` is scheme-restricted at the DTO and at render; a fixture row containing
    `javascript:alert(1)` puts nothing in the attribute.
57. Both URL fields carry a `.max(2048)`.
58. `lesson.service` continues to assign `videoUrl`, `content` and `resources` field-by-field and
    never spreads the DTO into the repository.

**Wrapping coverage (L3)**
59. The completeness test is default-deny: it flags every interpolation not lexically inside
    `wrapUntrustedContent(...)` unless allow-listed with a reason.
60. The scan uses the TypeScript AST and passes on the correctly-wrapped multi-line
    `enrichedCandidates` call.
61. The scan covers object-literal properties passed to `.invoke(` and message-object `content` keys,
    so `lessonInsightsAI`'s wrapping is verified rather than skipped.
62. `state.weakConcepts` and `state.reflectionFeedback` in `mergeAndExplain.node.ts` are wrapped, and
    the test proves both.
63. The test's documented false negatives (cross-file prompt assembly, wrong `source` label,
    mixed-trust `JSON.stringify`) are recorded; the test claims no completeness it lacks.
64. The failure message prints `file:line`, the flagged expression, and the two remedies.

**Read boundary**
65. `findByLessonId` uses `safeParse`, never throws, and returns `concepts: []` on failure — pinned
    by storing `{"concepts": "not-an-array"}` and asserting all five consumers still return.
66. The read schema is the stored concepts **array**, not the `{ concepts: [...] }` wrapper, and
    carries no cardinality bound: a 2-element and a 9-element array both survive with per-element
    validation applied.
67. The insights cache treats a parse failure as a miss, so regeneration heals a poisoned row.
68. `quiz.service`'s level-3 promotion degrades to promoting zero concepts on a parse failure; a
    malformed row does not turn a graded submission into an error.
69. `lessonAI`'s existing defensive non-string filter stays, and the tutor's behaviour on a bad row is
    unchanged: empty allowlist → `toolPolicy` denies all writes.

**Structural invariants**
70. A contract test asserts `chat_response` does not read `state.messages`.
71. `quizAI`, `lessonInsightsAI` and `learningPathAI` input DTOs contain no free-text string field;
    adding one fails the build.
72. Every service constructing a `ChatOpenAI` appears in the conformance declaration; one that does
    not fails CI.

**Shipped mode (D-M, 2026-08-18)**
75. `courseAI` and `learningPathAI` reject; `quizAI` and `lessonInsightsAI` emit and continue. A
    boundary rejection is not distinguishable by the caller from a semantic-validation failure on
    any surface — the rejection error extends the existing failure type and carries its message.

**C7**
73. Only validator messages are fed back into quizAI's retry prompt; a thrown error retries with no
    hint and is logged.

**Regression**
74. The full existing suite passes unchanged — `ai-tutor-guardrails`' behaviour is preserved, not
    re-litigated.

## Agent notes

- **The two URL policies are not interchangeable.** The split is by *who authored the text*, not by
  component. Applying `authoredContentUrlPolicy` to model output reopens the channel
  `ai-tutor-guardrails` closed; applying `modelOutputUrlPolicy` to lesson bodies breaks existing
  courses. New renderers pick by author, and the choice belongs in the declared map.
- **`validateReply` keeps the verbatim check.** It is the one check needing `retrievedContent`.
  Moving it to `_shared` would force every caller to pass an empty array and make the tutor's
  strongest control look optional.
- **courseAI's boundary must be a graph node.** `persist_and_emit` is downstream of `chat_response`
  in the same invocation, so a route-level check races the commit rather than preventing it. The
  route's `finally` is *detection* for the two exits a node cannot see, not enforcement.
- **`AiFeature`, `GuardContext["feature"]` and `AiRateLimitFeature` are three unions with three
  different jobs.** Two of them were aliased or hand-maintained, and that is exactly how surfaces
  lost telemetry and rate limiting. `AiRateLimitFeature` derives from `AiFeature`; `GuardContext`
  stays narrow deliberately. Re-aliasing them to "remove duplication" reintroduces the bug.
- **Default-deny is the point of the completeness test.** An untrusted-name registry only finds
  fields someone already classified. `state.reflectionFeedback` is the proof: it is model output
  entering another model's prompt, and no reasonable "known-untrusted" list would have named it.
- **An output rejection must never feed a retry.** `mergeAndExplain` already loops three times with
  its violation reason in the prompt; joining that loop would turn the fix into a hill-climbing
  oracle.
- **quizAI and lessonInsightsAI detect but do not enforce.** Their output boundary runs and emits;
  it does not reject the generation. That is decision D-M, taken on the measured false-positive rate
  (11.1% and 9.5%, all `untrusted_data_echo`, almost all of it lessons that legitimately discuss the
  wrapper tag) rather than on a hunch. Anyone reading the conformance matrix should see
  `applied_with_exception` there, not `applied`. Flipping either to fail-closed is a follow-up gated
  on bringing that number down, and the matrix test is what will make the declaration follow.
- **The false-positive corpus is part of the control.** `evals/datasets/aiOutput/falsePositive.jsonl`
  contains both the literal `<untrusted_data` and its escaped form deliberately: the escaped rows
  are what prove `wrapUntrustedContent`'s escaping works, and dropping them would make the number
  measure something else. Re-measure before changing any rule in `_shared/aiOutput/checks.ts`.
- **This feature does not close the detection loop.** `logSecurityEvent` still writes to stdout with
  no consumer (`ai-tutor-guardrails` security.md S13 §13). This work roughly triples the number of
  surfaces emitting events and does not give them a destination — that remains the highest-value open
  item in the AI area and is tracked separately.

Security design, decision record and accepted risks live in [`security.md`](./security.md).
The decision and its consequences are recorded in
[ADR-026](../../../adr/026-shared-ai-defence-layers.md).