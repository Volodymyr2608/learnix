---
feature: <slug>
status: planned
models: []
depends-on: []
---

<!--
Sections below are the fifteen fields a feature spec carries, in reading order. Delete the guidance
text as you fill each one.

Required in every spec: Description, Business goal, Supported use cases, Acceptance criteria,
Source of truth, Agent notes.

Everything else is delete-if-not-applicable — an empty heading is worse than no heading.

Mandatory for an AI surface (a prompt, a model call, an agent tool, a RAG path, or model-authored
rendering), no exceptions: Inputs, Outputs, Validation, Edge cases, Failure & fallback, Security,
Performance, Observability, Test & eval scenarios. See `documentation-process.md` §4 for why each of
those stops being optional the moment a model is in the path.
-->

## Description

What the feature *is*, in two or three sentences — the thing a reader who has never seen it needs
before anything else makes sense. Not why it exists (that's the next section), not how it's built.

## Business goal

Why it exists, in business terms: who needs it, what it costs them today, what changes when it
ships. One paragraph. If you cannot name whose problem this solves, the feature is not ready to
spec.

## Supported use cases

What the feature does *right now*. Describe current behavior only — no "previously / now" diffing;
git history covers that. Bullet per use case, each one something a reader could go and try.

## Unsupported use cases

What it deliberately does **not** do, and — where the reader would otherwise wonder — one clause on
why not. This is the section that stops the next person re-litigating a scope decision or filing the
absence as a bug. Name the thing that was cut, not every conceivable non-feature.

## Inputs

Every channel data arrives through, split into **trusted** and **untrusted**, and where each
untrusted one crosses its boundary (the file and function that enforces it, not "at the API layer").
Required for any AI surface: an untrusted input has a contract that does not follow from its type
the way an ordinary argument's does.

## Outputs

The shape produced, who consumes it, and through which rendering or persistence channel. For a
probabilistic output say what is guaranteed about it (a parsed schema, a bounded set) and what is
not.

## Validation

What is checked, where, and what happens to input that fails — per boundary named above. Include the
schema (Zod type or file), the layer that runs it, and whether a failure is a rejection, a
correction, or a fallback. For an AI surface this covers all three checkpoints: user input, tool-call
arguments, and model output.

## Acceptance criteria

Applies: [`docs/constitution.md`](../constitution.md) — the standing constraints (structure, style,
error handling, security, testing) are inherited, not retyped here — plus the feature-specific
criteria below.

The definition of done. Each line judgeable pass/fail by a reviewer. For AI features, phrase each one
so it could become an eval case directly.

## Edge cases

The cases a reader would otherwise have to discover from the code: empty inputs, concurrent callers,
partial state, the second click on the same button.

## Failure & fallback

What happens when a dependency fails — per failure, not in general: the model call errors, the rate
limit trips, a tool times out, validation rejects, confidence lands low, the stream drops mid-reply.
For each: what the user sees, what is persisted (usually nothing), what is emitted, and whether the
system fails **open** or **closed**. A flow with named nodes puts the per-node matrix in its
`flow-contract.md` / `graph-contract.md` and links to it from here rather than duplicating it.

## Security

Only when the feature has a security or AI surface. Holds the output of the `/spec` threat pass
(`security-auditor` and/or `llm-security-auditor` in `design` mode): the threats kept, the control
answering each, and anything deliberately accepted. Every control here must also appear as an
acceptance criterion above, since that is what `/plan` turns into a task and `/qa` checks back.

For **complex** tier this moves to a sibling `security.md` (plus `threat-model.md` when warranted) —
see `features/ai-tutor-guardrails/`.

## Performance

Latency budget (p95), token/cost ceiling, rate limits, and the size bounds that keep them true
(context window trimming, chunk counts, retry caps). Numbers, not adjectives; where a number is not
yet measured, say so and name who owns measuring it.

## Observability

What this feature emits, and what it deliberately does not. Name the events or metrics, the fields
they carry, which of them reach an alerting destination rather than only the log, and — for any AI
surface — the fields that are *structurally* excluded rather than redacted. Required whenever the
feature has an AI surface or a security control: a control nobody can see firing is indistinguishable
from one that stopped working.

## Test & eval scenarios

The scenarios that prove the criteria above, mapped to where they live: unit (`*.test.ts`),
integration (`*.integration.test.ts`), contract (`*.contract.test.ts`), eval (`evals/`). Name the
adversarial and degradation cases explicitly — the happy path is the one nobody forgets. An AI
surface names its eval set here; evals never run in PR CI, so the spec is where the reader learns
they exist.

## Source of truth

Where to look when two things disagree — `documentation-process.md` §1a is the standing rule; this
section names the feature's own artifacts:

- Behavior now: this file.
- Decisions: `docs/adr/NNN-<slug>.md`.
- Node-by-node contract: `<flow-contract>.md` (if the feature has one).
- Correctness: the tests named above.
- Build history (frozen, never updated): `build/plan.md`.

## Agent notes

Anything an agent needs to know that isn't visible from reading the code — non-obvious invariants,
ordering constraints, or gotchas a future change could easily break.