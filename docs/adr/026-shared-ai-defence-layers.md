# ADR-026: Shared AI Defence Layers

- **Status**: Accepted
- **Date**: 2026-08-18

## Context

`ADR-022` moved the **input** side of every AI surface into `_shared`: one guard module, one
wrapper, five services calling them. Nothing did the same for the other boundaries. Output
validation, render policy, resource limits and detection were all built during `ai-tutor-guardrails`
and all of them lived inside `server/services/lessonAI/`.

The result was a platform where one surface was defended and the other four were defended by
accident of where the folder boundary happened to fall. Of five model-calling surfaces: one had an
output boundary, one had a render policy, two were covered by a rate limiter, and **three could not
emit a security event at all** — `SecurityEvent.feature` was typed as `GuardContext["feature"]`,
which names only the two chat surfaces that run the input guard. The same defect repeated one layer
down: `AiRateLimitFeature` was a hand-maintained union that omitted `quizAI` and `lessonInsightsAI`,
so those two could not be rate-limited *by type*.

None of that was a threat-model decision. It was extraction that stopped halfway.

Three live defects were found while implementing, which is the strongest argument that the
asymmetry was not cosmetic:

- `learningPath.regenerate` had no enrollment check. Any authenticated student could obtain lesson
  titles and model-written reasons for a course they were not enrolled in. The SSE twin had verified
  the enrollment since it shipped.
- `LessonInsights.concepts` was read with `.map`/`.filter` straight off a JSON column by three
  consumers. A row holding a string was a `TypeError` on the lesson page, the tutor and the quiz
  service.
- `mergeAndExplain` fed a model-authored `lessonId` back into the next attempt's prompt through its
  validation-feedback string, with the field typed as an unbounded `z.string()`.

## Decision

Move the remaining boundaries into `_shared`, give every AI surface the same stack, and make
per-surface coverage a **test** rather than a document.

1. **`_shared/aiOutput`** — one `validateModelText`, one rejection path, one security event. The raw
   checks are not exported, so no caller can receive a validator exception; a check that throws is
   itself a rejection.
2. **Leak markers are a total `Record<AiFeature, readonly string[]>`** with no fallback, pinned per
   assembled prompt **variant** rather than per feature. A `Partial` record with `?? []` is the same
   defect one level down: surface number six would get silent zero coverage while the matrix still
   read `applied`.
3. **`AiFeature`, `GuardContext["feature"]` and `AiRateLimitFeature` are three declarations with
   three jobs.** `AiRateLimitFeature` derives from `AiFeature`; `GuardContext` stays narrow
   deliberately. TypeScript cannot tell a derived alias from a hand-copied union, so the guard
   against a future "remove the duplication" refactor is a source-text contract test.
4. **Enforcement and detection are split on courseAI.** The graph node computes the verdict silently
   and gates the step commit; the route re-runs the boundary in a `finally` on every exit and is the
   sole emitter. A graph node cannot fire on client abort or a mid-stream provider error — the two
   exits where tokens already reached the browser — so "at most one event per turn" is structural
   rather than coordinated.
5. **Wrapping completeness is default-deny.** An AST scan over every model-calling file flags any
   interpolation not lexically inside `wrapUntrustedContent`, and an exemption is a per-expression
   claim with a written reason. `state.reflectionFeedback` is why: model output entering another
   model's prompt, which no reasonable "known-untrusted" list would have named.
6. **Measure before enforcing.** A false-positive eval ships before any fail-closed rejection.

## Consequences

**The measurement changed the design.** courseAI and learningPathAI measured 0.0% false positives
and ship fail-closed. quizAI (11.1%) and lessonInsightsAI (9.5%) ship **report-only** — the boundary
runs and emits, and does not block (decision D-M). Every false positive came from one rule,
`untrusted_data_echo`, on lessons that legitimately discuss the wrapper tag. On those two surfaces a
rejection produces no error the instructor can act on; it simply yields no study guide and no quiz,
on exactly the lessons this platform teaches. At ~10% that costs more than the disclosure it
prevents.

That asymmetry is the point of the conformance matrix being per-rule and machine-checked: quizAI's
output boundary is declared `applied_with_exception` with the reason, and a test stops it reading as
`applied`.

**Leak recall is unmeasured.** No model recited on any surface, with or without the wrapper, so
`system_prompt_echo` was never exercised against a real leak. The markers are pinned and proven not
to misfire; whether they fire when they should is an open number, and the eval is a standing harness
that will produce one the first time a model complies.

**Detection still has no consumer.** This work raises the number of surfaces emitting security
events and does not give them a destination. That remains the highest-value open item in the AI
area, and it is now worth more than it was.

**Cost.** Two regex passes run twice per clean courseAI turn. Four surfaces gained a rate-limit
ceiling they did not have. One migration (`contextEligible`). The trust lists and the conformance
declaration are maintenance surface, priced deliberately: they are the artefacts that make a missing
control fail CI instead of reading as covered.

## Alternatives considered

**Leave the layers in `lessonAI` and copy what each surface needs.** Rejected: that is how the
asymmetry arose. Copying also makes drift invisible — a marker list copied to a second surface has
no mechanism telling anyone when the first one's prompt changes.

**One global leak-marker list.** Rejected: the tutor's markers are phrases from the tutor's prompt.
A global list gives four surfaces a check that is green in the matrix and empty in fact.

**A standalone `aiProcedure` base for rate limiting.** Rejected: a base is the shape that silently
*replaces* `instructorProcedure` at a call site and takes the role check with it. A middleware
composed onto a role procedure cannot do that. The type system does not prevent attaching it to
`publicProcedure` — `t.middleware` types against the root context — so a scan over the router tree
enforces what the types cannot.

**Fail closed everywhere.** Rejected on the measurement, not on principle. Revisit when
`untrusted_data_echo`'s false-positive rate on the structured surfaces comes down.