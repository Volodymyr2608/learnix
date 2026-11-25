---
feature: <slug>
status: planned
models: []
depends-on: []
---

<!--
The sections below follow the Spec Driven Development standard adopted 2026-11-02
(`documentation-process.md` §4): problem → discovery → requirements → alternatives → decision →
acceptance. Delete the guidance text as you fill each one.

Three kinds of section — §4's table is the authoritative list:

- Required in every spec: Description, Problem statement, Business / user value, Discovery,
  Ambiguities, Assumptions, User flow, Functional requirements, Alternatives, Trade-offs, Decision,
  Acceptance criteria, Source of truth, Agent notes. Enforced by
  `specSections.contract.test.ts` for every spec not on its legacy list.
- Conditional — delete when it does not apply (an empty heading is worse than no heading):
  Constraints, Unsupported use cases, and the Non-functional requirements subsections.
- Mandatory on an AI surface (a prompt, a model call, an agent tool, a RAG path, or model-authored
  rendering), no exceptions: Inputs, Outputs, Validation, Performance, Security, Observability,
  Edge cases, Failure scenarios, Test & eval scenarios.

A long spec may move Discovery and Ambiguities to `design/findings.md`, and Alternatives,
Trade-offs and Decision to `design/decision-summary.md`, keeping the headings there
(`documentation-process.md` §2).

Discovery-first: the first six sections are written BEFORE any solution is chosen. If Problem
statement names a button, an endpoint or a table, it is a solution in disguise — rewrite it.
-->

## Description

What the feature *is*, in two or three sentences — the orientation a reader who has never seen it
needs before anything else makes sense. Not why it exists, not how it's built.

## Problem statement

The problem, stated **without a solution in it**: who hits it, in what situation, and what it costs
them today. "A student unhappy with a course cannot get their money back without emailing support"
— not "add a refund button". Include what happens if we do nothing.

## Business / user value

Why solving it matters, split by party: what the user gains, what the product or business gains,
and where those two pull against each other (that tension is usually where the hard decisions sit).
If you cannot name whose problem this solves, the feature is not ready to spec.

## Discovery

What had to be learned before a solution could be chosen. Per finding: the question, the answer,
and the **source** (code path, ADR, external doc URL, experiment, measurement). Mark what an AI
assistant proposed and how it was verified — the full trail lives in the decision log, this section
keeps the findings that shaped the spec.

| Question | Finding | Source |
|---|---|---|

## Ambiguities

What was unclear or contradictory at the start, and how each was resolved — answered, decided (link
the Decision), or deliberately left open (and who owns closing it). An ambiguity resolved by
guessing belongs in Assumptions instead.

## Assumptions

What the spec relies on **without proof**, each with how it could be verified and what changes if it
turns out false. A claim about user behavior with no data behind it is an assumption, not a fact.

## Constraints

Fixed limits the solution must live within and cannot negotiate: an external API's behavior, an
existing ADR, a legal or financial rule, a deadline. Each with its source.

## User flow

The main path step by step, then each branch: rejection, error, cancel, retry. Name the actor at each
step. A small Mermaid diagram is welcome when branches cross.

## Functional requirements

What the feature does — the behavior a reader could go and try. Bullet per requirement. Once
shipped, this describes current behavior only; no "previously / now" diffing, git history covers
that.

## Unsupported use cases

What it deliberately does **not** do, and — where the reader would otherwise wonder — one clause on
why not. This stops the next person re-litigating a scope decision or filing the absence as a bug.

## Inputs

Every channel data arrives through, split into **trusted** and **untrusted**, and where each
untrusted one crosses its boundary (the file and function that enforces it, not "at the API layer").
Required for any AI surface.

## Outputs

The shape produced, who consumes it, and through which rendering or persistence channel. For a
probabilistic output say what is guaranteed about it (a parsed schema, a bounded set) and what is
not.

## Validation

What is checked, where, and what happens to input that fails — per boundary named above: the schema
(Zod type or file), the layer that runs it, and whether a failure is a rejection, a correction, or a
fallback. For an AI surface: user input, tool-call arguments, and model output.

## Non-functional requirements

Only the qualities that actually constrain this feature — delete subsections that don't. Numbers,
not adjectives; where a number is not yet measured, say so and name who owns measuring it.

### Performance

Latency budget (p95), cost ceiling, rate limits, and the size bounds that keep them true.

### Security

The output of the `/spec` threat pass (`security-auditor` and/or `llm-security-auditor` in `design`
mode): threats kept, the control answering each, anything deliberately accepted. Every control here
must also appear as an acceptance criterion. Complex tier moves this to a sibling `security.md`.

### Accessibility

Keyboard path, screen-reader labels, focus handling, contrast — for any new UI.

### Observability

What this feature emits and what it deliberately does not: events or metrics, their fields, which
reach an alerting destination, and — on an AI surface — the fields structurally excluded rather than
redacted.

### Maintainability

What keeps this changeable: the seam a future change will most likely touch, and what protects it
(a contract test, a single owner module, a documented invariant).

## Edge cases

The cases a reader would otherwise have to discover from the code: empty inputs, concurrent callers,
partial state, the second click on the same button.

## Failure scenarios

What happens when a dependency fails — per failure, not in general. For each: what the user sees,
what is persisted, what is emitted, and whether the system fails **open** or **closed**. A flow with
named nodes puts the per-node matrix in its `flow-contract.md` / `graph-contract.md` and links it.

## Alternatives

For every non-trivial decision, at least two real options — including the one not taken. Name the
decision, then the options. If a decision genuinely has one option, say so in a line and why. For
complex tier the full analysis lives in the ADR; summarise here and link it.

## Trade-offs

How the options compare, against criteria named **before** comparing: complexity, risk, cost, product
impact, technical impact. A table per decision works well. Where the comparison rests on an
experiment or measurement, link it.

| Criterion | Option A | Option B |
|---|---|---|

## Decision

What was chosen per decision, and **why in this context** — the argument a reviewer can disagree
with, plus the evidence (research, experiment, measurement) behind any number. "The model suggested
it" or "it was simpler" is not a reason on its own.

## Acceptance criteria

Applies: [`docs/constitution.md`](../constitution.md) — the standing constraints are inherited, not
retyped here — plus the feature-specific criteria below.

The definition of done. Each line judgeable pass/fail by a reviewer and traceable to a requirement
or a security control above. For AI features, phrase each so it could become an eval case directly.

## Test & eval scenarios

The scenarios that prove the criteria above, mapped to where they live: unit (`*.test.ts`),
integration (`*.integration.test.ts`), contract (`*.contract.test.ts`), eval (`evals/`). Name the
adversarial and degradation cases explicitly.

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
