# AI content supply chain — findings register

**Status:** living document · **Opened:** 2026-08-16 · **Last reviewed:** 2026-08-28

A cross-feature review of the content supply chain — how text written on one surface reaches a model,
a record or a student on another. Every finding is listed here by its id, because those ids are cited
from specs, ADRs and the conformance matrix, and a citation that leads nowhere is worse than no
citation.

This is a **register**, not a report: each entry says what the defect was, what it cost, and where it
stands today. The reasoning about the system's shape is in [`strategy.md`](./strategy.md); the
per-surface layer status is in
[`aiSurfaces.ts`](../../server/services/_shared/conformance/aiSurfaces.ts), which is asserted by a
contract test and is the authority when this file disagrees with it.

---

## Content findings

| # | Finding | Severity at open | Status |
|---|---|---|---|
| **C1** | `courseAI`'s cross-tenant containment is real, load-bearing, and pinned by nothing — `chat_response` not reading `state.messages` is the only thing keeping another instructor's course copy out of a streamed reply | Medium now, Critical if it regresses | **Closed** — pinned by contract test and declared as an exclusion in the matrix ([`ai-defence-layers`](../specs/features/ai-defence-layers/spec.md)) |
| **C2** | `mergeAndExplain` interpolates instructor-derived text outside the wrapper — one line below a correctly wrapped region | Medium | **Closed** — `weakConcepts` is wrapped as `lesson_summary` |
| **C3** | Three student-facing render paths have no URL policy (tracking/exfiltration through image and link destinations, not XSS) | Medium | **Partly closed** — the tutor enforces `inAppUrlTransform`; `CourseLearnView` and the builder's `ChatMessage` still render without one (tutor S13 §32) |
| **C4** | The quiz answer key defeats the tutor's own level-3 integrity argument: `getByLesson` returned `correct` to any enrolled student, so "confirmation by action, not by text" was refuted by the network tab | Medium | **Half closed** — see below |
| **C5** | Instructor content feeding the AI pipeline has no length cap (cost/DoS) | Medium | **Partly closed** — the URL fields were capped by `ai-defence-layers`; `content` / `title` / `description` remain open |
| **C6** | An instructor's text becomes the vocabulary of a student's regulated record, through a model, with no human confirmation step | Low-Medium (compliance/design, not exploitable) | **Accepted by design** — the allowlist is closed and fail-closed; the residual is recorded as tutor S13 §7 |
| **C7** | `quizAI` feeds its own error strings back into the prompt, and provider errors sometimes echo request content | Low | **Accepted, declared** — carried as an exception in the conformance matrix |

### C4 in detail, because two features cite it

C4 makes **two** claims, and only the first is answered:

| Claim | State |
|---|---|
| The key can reach a student or a model, and nothing checks it | **Closed** 2026-08-28 by [`quiz-answer-key`](../specs/features/quiz-answer-key/spec.md) — narrowed at the repository, paired with an attempt cap so removing it did not turn one read into an enumeration, and pinned by two contract tests rather than by an absence of code |
| The key is **model-authored**: a poisoned lesson can steer which option is marked correct | **Open** — no layer checks it, and nothing in that feature adds one |

The matrix entry for `quizAI` was therefore *narrowed*, not dropped. Deleting it would have had the
conformance matrix certify a guarantee the platform does not deliver — the same failure mode as
shipping the projection without the cap, one level up.

## Systemic gaps

These are the ones that were never about a single line of code.

| # | Gap | Status |
|---|---|---|
| **G1** | The output boundary existed on exactly one of five surfaces | **Closed** — all five now carry one; on `quizAI` and `lessonInsightsAI` it is report-only at a measured ~10% false-positive rate (D-M) |
| **G2** | Three of five surfaces could not emit a security event, by type | **Closed** — the feature union is derived rather than hand-maintained, so a surface cannot be omitted silently |
| **G3** | "No input guard here" was a correct decision written down nowhere | **Closed** — `n/a` now carries a required reason in the matrix |
| **G4** | The resource boundary covered the three SSE routes and nothing else | **Closed** — per-feature keys, plus a distributed store so the ceiling survives more than one instance |
| **G5** | Model output becomes authority input across a feature boundary, validated in one consumer | **Closed** — parsing moved to the read boundary, so both consumers inherit the guarantee |
| **G6** | Wrapping was verified by registration, not by coverage — a registered file proves the module imports the wrapper, not that the field is wrapped | **Closed** — coverage is asserted per field |
| **G7** | The render boundary was applied in one of three markdown paths | **Partly closed** — same two paths as C3 |
| **G8** | No test spanned two features, so cross-feature guarantees had no owner | **Closed** — the conformance matrix and its contract test are that owner; `studentSurface.contract.integration.test.ts` is the pattern for a guarantee that lives between features |

## What this review changed about how work is planned

Two habits came out of it and are now process rather than intention:

- **A finding is rated inside its own feature and can still be wrong.** C4 was fairly rated *low* on
  the quiz surface; its severity came entirely from a guarantee written in the tutor's spec. Severity
  is now assessed against the guarantee, not against the file.
- **A guarantee with no cross-feature test has no owner.** G8 is why the two heaviest tests in the
  repository are the ones that sweep every student-reachable procedure and every tool definition,
  rather than any single feature's unit tests.