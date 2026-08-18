# Security — ai-defence-layers

**Status:** design (produced at `/spec`, 2026-08-17) · **Tier:** complex ·
**Method:** two design-mode agent passes (`security-auditor`, `llm-security-auditor`) over the
drafted spec, plus code verification of every load-bearing claim.

Written as requirements, so it can be followed without reading the implementation. Every control here
appears as an acceptance criterion in [`spec.md`](./spec.md) — that is what makes `/plan` unable to
omit it and `/qa` able to check it back.

Companion analysis: `docs/security/2026-08-16-ai-content-supply-chain.md` Part II (layer model,
conformance matrix, gaps G1–G8). Prior art this generalises:
[`../ai-tutor-guardrails/security.md`](../ai-tutor-guardrails/security.md).

---

## S1. What this feature defends

The subject is not a new surface — it is the **uniformity** of five existing ones. The asset at risk
is therefore unusual: it is the *claim* that the platform's AI surfaces are defended. Today that
claim is true of one surface and read as true of five.

**Assets**
- Instructor course drafts (`CourseGeneration.content`, `CourseGenerationMessage`).
- The AI spend budget — OpenAI calls per user, per process.
- `LessonInsights.concepts`, which is the write allowlist for `ConceptMastery`, a regulated
  educational record.
- `Lesson.videoUrl` / `Lesson.resources` — stored destinations rendered to every enrolled student.
- The security-event stream, which is the compensating control that prices the accepted streaming
  disclosure (tutor S13 §2), now extended to a second streaming surface.

**Actors**
- Authenticated INSTRUCTOR, malicious but legitimate: owns their content, wants to burn budget, poison
  a stored JSON row, or plant a beacon in a lesson body.
- Authenticated STUDENT: wants unearned mastery, or reaches a procedure a middleware refactor
  accidentally opened.
- An instructor whose *content* is the attacker via a model — the cross-tenant path (C1), where the
  author of the steering text is not the person running the generation.

## S2. Trust matrix — fields reaching a model on the four newly-covered surfaces

| Field | Author | Trust | Required handling |
|---|---|---|---|
| `state.userMessage` (courseAI) | this instructor | untrusted | `guardUserInput` (present) + eligibility filter (S5) |
| `state.history[]` (courseAI) | instructor + model | untrusted | **needs `contextEligible`** — migration, S5 |
| `state.content` (courseAI) | model + instructor | untrusted | wrapped (verified) |
| tool results in `state.messages` (courseAI) | **other instructors** | untrusted | contained by `chat_response` not reading them — S8 |
| `lesson.content` (insights, quiz) | instructor | untrusted | wrapped once at the service (verified) |
| `state.weakConcepts` (learningPathAI) | instructor → `lessonInsightsAI` | untrusted | **raw today** at `mergeAndExplain.node.ts:174` |
| `state.reflectionFeedback` (learningPathAI) | **model** (`reflectAndCheck`) | untrusted | **raw today** at `mergeAndExplain.node.ts:177` |
| `enrichedCandidates` (learningPathAI) | instructor | untrusted | wrapped (verified) |
| `violationFeedback` (learningPathAI) | server | trusted | ids + fixed strings |
| `hint` (quizAI) | validator **or arbitrary exception** | mixed | fixed by S9 |
| session ids | server | trusted | closure-bound, never a tool argument |

`state.reflectionFeedback` is the case that justifies the default-deny design in S7: it is one
model's output entering another model's prompt, one line below a correctly wrapped region, and no
"known-untrusted field names" list would have named it.

## S3. The output boundary must be per-feature, or it is decorative

**Requirement.** `SYSTEM_PROMPT_LEAK_MARKERS` is a **per-`AiFeature` registry**, and each feature's
markers are pinned as verbatim substrings of that feature's real assembled prompt.

The tutor's four markers are English phrases from the tutor's prompt ("You are an AI tutor for one
lesson of one course", …). Run against a courseAI reply they have *zero* coverage. A single global
list would produce a check that is green in the conformance matrix and empty in fact — the exact
"boundary that exists somewhere and is missing here" defect this feature exists to kill, reintroduced
by its own fix. For courseAI the markers come from the two *streaming* prompts only (`chat_response`
and `clarify`), because those are the only node outputs the route sends to the browser.

**Requirement.** `_shared/aiOutput/` imports nothing from `server/services/lessonAI/`, or `_shared`
inherits a surface dependency.

**Requirement.** The throw→rejection conversion is exported once and the raw checks are not exported.
Four new call sites are four new chances to write `catch { /* allow */ }`; the tutor's fail-closed
guarantee currently lives in *its caller*, and extraction must not multiply that obligation.

**Requirement.** Exactly one event per rejected text. `validateReply` emits inside `reject()` today;
if both the shared function and the composition emit, the tutor's `output_validation_failed` count
doubles against a "any occurrence" baseline that prices an accepted risk.

**Requirement.** Rule precedence is preserved — `system_prompt_echo → untrusted_data_echo →
verbatim_chunk_echo → off_origin_link`. S11's thresholds read the `ruleIds` distribution to name the
channel, so reordering silently refiles content scraping as exfiltration.

**Stated limit.** On short structured fields (`definition`, `reason`, `option`) the effective content
of the boundary is the `untrusted_data` echo and the off-origin destination; a 300-character string
will not contain a 15-word marker phrase. The conformance declaration records this rather than
letting the matrix imply full leak detection everywhere.

## S4. courseAI — enforcement in the graph, detection in the route

`graph.ts` wires `chat_response → assess_completion → extract_step_data → validate →
confidence_score → persist_and_emit → END`. The step commit is **downstream of the model call inside
the same graph invocation**, so by the time the route has accumulated `assistantFullText` the
transaction has already run. A route-level check is a race, not a control.

**Requirement.** The boundary is a graph node, and the invariant is structural rather than positional:
*no path from a streaming node (`chat_response` or `clarify`) reaches `END` or `persist_and_emit`
without traversing `output_boundary`.* `clarify` streams too (`STREAMING_NODES`) and edges straight to
`END`, and `assistantText` has an append reducer, so one turn can accumulate text from both. Stating
the invariant over the edge list is what makes it survive the next node someone adds.

**Requirement.** The route additionally runs the boundary from a `finally`, emitting the event when
the node was never reached. A graph node cannot fire on client abort or a mid-stream provider error —
the two exits where tokens have already reached the browser. This is the same bypass the tutor closed
in commit `9ed8b00`; rediscovering it on a second surface is the predictable outcome of not writing it
down. Guard against double emission.

**Requirement.** No fallible write between the security event and the `retract` frame.

**Accepted.** `retract` is mitigation, not the boundary — the tokens are already rendered, and whether
they disappear depends on the client handling a new event type. The boundary is **non-persistence**:
nothing enters the thread, the model's future context, or the committed step. This is the same
acceptance as tutor S13 §2, and it is priced on S8 holding.

## S5. The eliciting prompt must leave model context — a migration

`CourseGenerationMessage` has **no `contextEligible` column**, and `hydrateState` replays the last
rows with no eligibility filter. The user message is persisted in the route's `finally` *after* the
graph, so a rejected prompt is absent this turn and present next turn — replayed as a `user`-role
message with no L3 wrapping.

Re-asking after a rejection therefore draws a fresh sample from a stochastic model with the previous
attempt sitting in context as ordinary conversation. Identical to the tutor's hazard, on the surface
where the model's output *commits a step*.

**Requirement.** `contextEligible Boolean @default(true)` on `CourseGenerationMessage`; `hydrateState`
filters on it; the `finally` write sets `false` when the boundary rejected. The message stays visible
in the instructor's thread — only the model's view narrows.

**Decision D-A (developer, 2026-08-17): migration, matching the tutor.** The alternative — not
persisting at all — was rejected because the instructor's own message vanishing from their thread with
no explanation is a worse product outcome on a surface where the "attacker" is usually just someone
phrasing a request badly.

## S6. Rejection is terminal, and its reason never enters a prompt

`mergeAndExplain` already loops up to three times feeding `Validation error to fix: ${…}` back into
the prompt. If an output-boundary rejection joined that loop with its reason, the platform would tell
the model which detector fired and invite another draw — a hill-climbing oracle built out of the fix,
needing no user in the loop.

**Requirement.** An output-boundary rejection is terminal for the whole generation: it does not consume
a `semanticValidate` retry, does not append to the violation feedback, and its reason never appears in
any prompt.

**Requirement.** Rejection is whole-generation, never field-level. The surviving fields were authored
by the same model in the same turn under the same influence; the schemas forbid partials anyway
(`SummarySchema` is `min(40)`, `PathStep.reason` is required). `GlossarySchema` (`min(0)`) is the one
schema that would permit dropping an entry — rejected for uniformity, because field-level rejection is
a silent-degradation path on a control whose baseline is zero.

**Sequencing requirement.** L5-on-insights must ship with L7-on-insights. A rejection must precede the
`contentHash` upsert, so a rejected generation is never cached, so the next call regenerates — three
chains per call with no rate limit today. Shipping the boundary without the limiter converts a
rejection into an unbounded regeneration loop paid in tokens.

## S7. Wrapping completeness is default-deny

**Requirement.** The contract test flags **every** interpolation in a registered file that is not
lexically inside a `wrapUntrustedContent(...)` call, unless the identifier is in a small
`TRUSTED_INTERPOLATIONS` list or carries an allow entry with a `reason`. A "known-untrusted names"
registry is the registration-vs-completeness failure one level down — it would not have found
`weakConcepts` unless someone had already found `weakConcepts`, and it would not find
`reflectionFeedback` at all.

**Requirement.** TypeScript AST, not regex. The *correct* call at `mergeAndExplain.node.ts:170-173`
spans four lines because Biome wrapped it; a same-line regex flags the good case and can be defeated
by formatting the bad one.

**Requirement.** Coverage extends past template literals to object-literal properties passed to
`.invoke(` and to message objects with a `content` key. `lessonInsightsAI` wraps via
`.invoke({ content: wrapUntrustedContent(...) })` with no template literal anywhere — a literals-only
scan would give the surface with the cleanest wrapping zero coverage.

**Documented false negatives** (recorded so the test claims no completeness it lacks, and so the
manual `llm-security-auditor` pass stays justified):
1. Cross-file prompt assembly — the scan is per-registered-file.
2. Wrapped with the wrong `source` label — semantics the scan cannot see.
3. `JSON.stringify` over a mixed-trust object — wrapping the whole thing passes and is correct, but
   the scan cannot distinguish that from unnecessary wrapping.

## S8. Cross-tenant containment is load-bearing and currently pinned by nothing

`search_similar_courses` returns *other instructors'* titles and subtitles. The reason a successful
injection there cannot reach instructor B's screen is that `chat_response` builds its messages from
`state.content` / `state.history` / `state.userMessage` and **never reads `state.messages`**.

That looks like an omission, and it is exactly the omission a future "ground the reply in the
retrieved examples" improvement would fix — turning a contained channel into instructor-A-to-
instructor-B injection landing in a renderer whose URL policy this same feature is installing.

**Requirement.** A comment stating the exclusion is deliberate, and a contract test asserting it.
**Requirement.** If grounding in tool results is ever wanted, it arrives *with* an output boundary and
the render policy, as one change.

S4's streaming acceptance is priced on this holding — the two are one acceptance, not two.

## S9. Fail-opens must be declared and telemetered

Two undeclared fail-opens exist today and start emitting under this feature:
- `quizAI.service.ts` catches a thrown error and re-invokes with `hint` set to the exception message.
  That is both an undeclared fail-open *and* an unwrapped path from an error channel into a prompt
  (C7). Telemetering it without fixing it would be worse than leaving both alone, so **C7 is pulled
  into this feature**: only validator messages feed back; a thrown error retries with no hint.
- `learningPathAI`'s terminal `LearningPathInvalidError` after three failed semantic validations.

**Requirement.** `SecurityLayer` gains a value for model-call fail-opens. Without it callers will pick
`"L2"` because it is closest, and the layer field stops meaning anything.

## S10. Telemetry must be triageable, not merely emitted

**Requirement.** `SecurityEvent` gains a closed, **id-only** `subject` field.

On `learningPathAI`, `userId` is the *student* — the operator, not the author. The text that tripped
the boundary was written by an instructor, in a lesson the event does not name. The same holds for
insights and quiz. Without a subject, triage is timestamp correlation against application logs, which
is not a control. An id is structured, not free text, so S11's "no event carries free text, enforced
by the type" survives intact.

**Requirement.** Thresholds for the four newly-covered surfaces are set only after the false-positive
number exists (S11). Expected rate for insights / quiz / path is zero, because the denominator is
instructor content and instructor content is not adversarial — so "any occurrence" is the right
*shape*. But turning on "any occurrence" before measuring FP means the first legitimate AI-security
course pages someone, and the alert gets muted, which is strictly worse than no alert.

## S11. The false-positive risk is specific, predictable, and must be measured first

The lesson body is wrapped in `<untrusted_data source="lesson_content">`. A lesson *about* prompt
injection — plausibly this platform's own catalogue — may contain the literal string
`<untrusted_data`, and a faithful summary of it will echo the tag. That trips `untrusted_data_echo`
and hard-fails the instructor's insights generation with a neutral error and no diagnosis,
**permanently**, because the content hash never changes.

The repo's own history is the argument: the tutor's FP rate measured 17.5% against an assumed ≤5%
(tutor S13 §20) and was invisible until the corpus contained ordinary requests.

**Requirement.** `evals/aiOutput:falsePositive` ships **before** the thresholds, with the measured
number recorded here.

### Measured, 2026-08-18

42 rows of legitimate instructor and builder content, run through each surface's real assembled
prompt and real wrapping, 3 samples per row (the event is stochastic), 630 samples in total. The
model output was then judged by `validateModelText` with `emit: false`.

| Surface | Rejected | Rate |
|---|---|---|
| lessonAI | 0/126 | **0.0%** |
| courseAI | 0/126 | **0.0%** |
| quizAI | 14/126 | **11.1%** |
| lessonInsightsAI | 12/126 | **9.5%** |
| learningPathAI | 0/126 | **0.0%** |

**Every rejection came from one rule: `untrusted_data_echo` (26 samples, 4.1% overall).**
`system_prompt_echo` and `off_origin_link` produced no false positive on any surface.

By corpus kind, rejected samples only:

| Kind | Rejected | Rate |
|---|---|---|
| `untrusted_tag_literal` (content containing the literal `<untrusted_data`) | 18/45 | 40.0% |
| `untrusted_tag_in_code_fence` | 2/30 | 6.7% |
| `course_builder_turn` (the row quoting the tag) | 6/90 | 6.7% |

**Interpretation.** The predicted failure mode is real and it is narrow. It is not "content about
prompt injection" in general — it is content that reproduces the literal opening tag. A lesson that
quotes attack strings, discusses delimiters in prose, or writes the ESCAPED form `&lt;untrusted_data`
never tripped the rule: the escaped rows produced zero rejections, which confirms that
`wrapUntrustedContent`'s escaping does its job and that the residual event is the model re-emitting
a tag it read verbatim.

It concentrates on exactly the two surfaces that paraphrase lesson vocabulary back into short
structured fields — quizAI (a question about the tag contains the tag) and lessonInsightsAI (a
glossary entry FOR the tag). The two conversational surfaces and the path planner never reproduced
it, which is why their numbers are 0.0% rather than merely low.

## S12. The rate limiter is an authorization surface, not only a cost control

**Requirement.** `aiLimits` exports a **middleware** composed onto existing role procedures. A
standalone `aiProcedure` base is the shape that silently *replaces* `instructorProcedure` at a call
site, dropping the role check — a student reaching instructor quiz generation. If a base form is ever
wanted, it is named `instructorAiProcedure` / `studentAiProcedure` so the role is in the name.

**Requirement.** The limiter runs after session and role checks, and its key derives from
`ctx.session.user.id` only — never from input, headers, or a generation id.

**Requirement.** The aggregate check lives inside `checkAiRateLimit`, not in the tRPC middleware, or
the three raw `app/api/chat/**` routes keep a separate aggregate and tutor S13 §31's tripled budget
survives on the surface it was reported against.

**Requirement.** Both windows are evaluated before either is incremented, or a request rejected by the
aggregate still spends its per-feature window.

**Requirement.** `AiRateLimitFeature` derives from `AiFeature`. It currently omits `quizAI` and
`lessonInsightsAI` — G2's defect class at L7 instead of L8. Fixing telemetry and leaving the identical
bug in rate limiting would be a poor outcome for a feature whose thesis is that the class matters more
than the instance.

**Requirement.** Eviction frees space even when nothing is expired. `EVICT_THRESHOLD` is 5 000 while
keys per user rise toward six, and the sweep deletes only *expired* entries — so a burst of live keys
frees nothing and every subsequent call pays an O(n) scan on the request path.

## S13. The render boundary replaces a control it must re-implement

**Requirement.** Both policies use react-markdown's real signature,
`(url: string, key: string, node: Element) => string | null | undefined`. The existing
`inAppUrlTransform` is one-argument and therefore **cannot implement the image/link split at all** —
this is the most likely implementation error in the feature.

**Requirement.** Both policies apply a positive protocol allowlist *before* any origin comparison.
Overriding `urlTransform` removes `defaultUrlTransform`, which is what blocks `javascript:` and
`data:` today — the reason C3 is a beacon finding rather than XSS. `inAppUrlTransform` happens to
survive because `new URL("javascript:x").origin` is `"null"`, but that is an accident of the origin
comparison, not a decision, and it is fragile for `blob:`.

**Requirement.** A contract test asserts no renderer enables `rehype-raw` or `allowDangerousHtml`.
`urlTransform` applies only to markdown-derived `src`/`href`; enabling raw HTML for a legitimate
authoring need (tables, `<details>`, embeds) would silently void the entire layer, and nothing in the
suite would go red. The same reasoning covers `srcset`, `<iframe>`, `<link rel=preload>` and CSS
`url()` — none emittable by markdown, all emittable by raw HTML.

**Requirement.** `videoUrl` is host-allowlisted at the DTO **and** at render. The DTO is a write
control; rows written before it were never parsed.

**Decision D-B (developer, 2026-08-17): host allowlist for video.** A scheme-only restriction would
leave `<source src="https://evil.example/beacon.mp4">` — the same zero-click off-origin fetch as an
image, in the same component whose images are now same-origin-only.

**Accepted risk.** `authoredContentUrlPolicy` deliberately permits off-origin *links* in lesson
bodies, so an instructor can still place a tracking link a student clicks. That is the product
decision (D-C); it means the tutor's stricter rule is not the platform standard, and a future reviewer
would otherwise read the asymmetry as a bug. `rel="noopener noreferrer"` bounds the referer leak.

## S14. The read boundary must not become a self-inflicted outage

`LessonInsights.concepts` is read by five consumers, including `quiz.service`'s level-3 promotion path
*after* `QuizAttempt` is written.

**Correction at implementation.** This section was written as though it formalised an existing
graceful degradation. It does not: on a stored value of `{"concepts":"not-an-array"}`,
`lessonAI.service.ts`, `lesson.repository.ts` and transitively `quiz.service.ts` called `.map` on a
string and threw a `TypeError`. The requirements below are a **bug fix** with a boundary attached,
not a formalisation — which is also why the parse lives in the repository rather than in each
consumer, and why the second read path parses per element (an `Array.isArray` guard would let
`[{ notName: 1 }]` through and yield `[undefined]` downstream).

**Requirement.** `findByLessonId` uses `safeParse` and **never throws**; on failure it returns
`concepts: []` and emits telemetry. A strict throwing parse would let one malformed stored row break
the student study guide, the tutor, the learning path and quiz promotion at once — and, because the
insights cache reads the row before regenerating, the bad row would **block its own replacement**.

**Requirement.** The read schema is the stored shape — the concepts **array**, not the
`{ concepts: [...] }` wrapper — and carries no `.min()`/`.max()`. The service stores
`result.concepts.concepts`; parsing stored rows with `ConceptsSchema` as drafted would fail on *every*
row, and its 3–7 bound is a generation-time cardinality rule that must not gate a read.

**Requirement.** A parse failure is a cache miss, so regeneration heals a poisoned row.
**Requirement.** The tutor's existing defensive filter stays; its behaviour on a bad row is unchanged
— empty allowlist, `toolPolicy` denies all writes, which is the documented fail-closed path.

## S15. Decision record

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D-A | courseAI rejected-prompt replay | **Migration**, `contextEligible` on `CourseGenerationMessage` | Matches the tutor; not-persisting loses the instructor's own message from their thread |
| D-B | `videoUrl` off-origin | **Host allowlist**, DTO + render | Otherwise contradicts the same-origin image rule in the same component |
| D-C | Off-origin links in lesson bodies | **Permitted**, with `rel="noopener noreferrer"` | Deliberate click; legitimate authoring need. Recorded as residual |
| D-D | quizAI `question`/`options` | **In scope** for L5 | Model-authored text persisted and shown to students; leaving one surface out reintroduces the asymmetry |
| D-E | Pre-existing insights / path rows | **Accept and record** | Boundary runs at write; existing rows are authored, not adversarial. Residual below |
| D-F | `aiProcedure` shape | **Middleware** onto role procedures | A standalone base is the shape that drops the role check |
| D-G | `learningPathAI`'s second limiter | **Consolidated** into `aiLimits`, 1/min per-(student, course) preserved | Two limiters with different semantics is how a ceiling moves with nobody deciding |
| D-H | `SecurityEvent.subject` | **Added**, closed id-only | Without it, events from three surfaces name the operator and never the author |
| D-I | Glossary partial rejection | **Whole generation** | Field-level rejection is silent degradation on a zero-baseline control |
| D-J | C7 (quizAI hint) | **Pulled into scope** | This feature telemeters that exact fail-open; instrumenting it unfixed is worse than neither |
| D-K | Parse-failure telemetry | Ordinary telemetry event, not a new `SecurityOutcome` | Data-shape defect, not an attack signal |
| D-L | Step-commit-after-retraction | Correlating event, courseAI analogue of `mastery_write_retained` | Same reasoning as tutor S13 §24 |
| D-M | Fail-closed vs report-only per surface, after the S11 measurement (2026-08-18) | **Split.** courseAI and learningPathAI (0.0% FP) **fail closed**; quizAI (11.1%) and lessonInsightsAI (9.5%) ship **report-only** — `validateModelText` runs with `emit: true` and the surface does not throw | The threshold in S11 exists so enforcement is priced. On the two structured surfaces a rejection is not a visible error the instructor can act on, it is a generation that silently produces nothing; at ~10% that is a worse outcome than the disclosure the rule prevents. Enforcement there is a follow-up gated on bringing `untrusted_data_echo`'s FP down, not on re-running the same eval |

## S16. Accepted risks and residuals

1. **Streaming disclosure on a second surface.** courseAI tokens reach the browser before any verdict
   exists, exactly as the tutor's do. Accepted on the same terms — the boundary protects durability,
   and `output_validation_failed` frequency is the compensating control. Priced on S8 holding.
2. **Pre-existing insights and learning-path rows never pass the boundary** (D-E). `getForLesson` /
   `getForCourse` serve stored rows without re-validating, and the insights `contentHash` never
   changes, so those rows are served indefinitely. Residual is bounded by the author being an
   instructor rather than an adversary.
3. **Leak detection on short structured fields is thin** (S3). The effective checks there are the tag
   echo and the off-origin destination.
   *Corrected at implementation:* "thin" understated the position this feature inherited. On quizAI,
   lessonInsightsAI and learningPathAI leak detection was not thin, it was **absent** — the marker
   registry knew only about the tutor, so those three surfaces ran no `system_prompt_echo` check at
   all. Task 8 makes the registry total and pins a marker against every prompt variant; what remains
   thin afterwards is the *fixed-phrase* nature of the markers (§4), not their existence.
4. **Fixed-phrase leak markers remain fixed-phrase** (tutor S13 §27). This feature makes them
   per-surface and pinned; it does not make them robust to paraphrase or translation.
5. **The completeness test's three documented false negatives** (S7) — cross-file assembly, wrong
   `source` label, mixed-trust `JSON.stringify`.
6. **The limiter stays per-process** (tutor S13 §17). This feature narrows blast radius and repairs the
   aggregate; it does not make the limiter distributed.
7. **Off-origin links in lesson bodies are permitted** (D-C).
7a. **quizAI and lessonInsightsAI detect but do not enforce** (D-M). Their output boundary runs and
   emits `output_validation_failed`; it does not stop the generation. A model that reproduces its
   instructions into a quiz question or a glossary entry on those two surfaces is visible in the
   event stream and still reaches the student. The compensating control is the same one the
   streaming surfaces rely on — event frequency — which is worth exactly as much as §8's missing
   sink.
8. **Nothing consumes the security events** (tutor S13 §13). This feature raises emission volume into
   a `consola` stdout writer with no sampling and no sink, and so raises the value of the sink and
   the cost of not having one.
   *Corrected at implementation:* an earlier draft of this section said the feature "adds an
   abort-path event that fires on ordinary client navigation", and priced the volume on that. Under
   the design that shipped, the courseAI route validates from a `finally` on every exit but emits
   **only on rejection** — a clean turn, including one the reader navigated away from, emits nothing.
   Abort-path events are therefore ~0% of emissions rather than a dominant fraction.

## S17. Out of scope, with blocking assessment

- **C4 (quiz answer key)** — not a blocking dependency, **but** it makes the conformance matrix
  certify something false: quizAI's L0 row would read `✓` while the answer key ships to students. The
  declaration format must therefore support "declared, with a known open exception referencing C4".
- **C5 (content length caps)** — the URL-field caps are folded in here (AC 57) because this feature
  already edits those three lines; `content` / `title` / `description` remain C5's.
- **S13 §13 (event sink)** — not blocking, cost raised (S16 §8).