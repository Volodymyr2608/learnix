# Refund self-service — documents

Status: **stable** (see the front matter of [`spec.md`](spec.md)). Money and consistency decisions:
[ADR-037](../../../adr/037-refund-payout-hold-and-money-consistency.md).

## Where to start

| You want to know… | Read |
|---|---|
| What the feature does and must do | [`spec.md`](spec.md) |
| Which security controls apply and which risks are accepted | [`security.md`](security.md) |
| Why the requirements are what they are (short) | [`design/findings.md`](design/findings.md), [`design/decision-summary.md`](design/decision-summary.md) |
| The full research behind a decision | [`discovery/`](#discovery--research-trail-frozen) |
| How it was built, slice by slice | [`build/plan.md`](build/plan.md) |
| What an AI proposed and how it was checked | [`journal/ai-decision-log.md`](journal/ai-decision-log.md) |

## Folders

Each folder holds one kind of document, so the name tells you whether it is still edited.

| Folder | Kind | Lifecycle |
|---|---|---|
| `/` | `spec.md` (requirements), `security.md` (controls) | living — the source of truth |
| `design/` | how the requirements were reached, moved out of the spec | living, edited with the spec |
| `discovery/` | research trail, one file per stage | frozen since spec approval |
| `build/` | implementation plans | frozen per slice |
| `journal/` | the author's AI decision log | keeps growing |

### `discovery/` — research trail (frozen)

Read in order; each stage builds on the previous one.

1. [`1-discovery.md`](discovery/1-discovery.md) — problem, questions Q1–Q25, ambiguities A1–A8
2. [`2-analysis.md`](discovery/2-analysis.md) — scenarios, contradictions C1–C5, gaps
3. [`3-alternatives.md`](discovery/3-alternatives.md) — options, weighted matrices and the decision, one section per question

[`raw/`](discovery/raw/) keeps the verbatim outputs these stages cite: the AI's discovery questions
and analysis review, and the `security-auditor` / `llm-security-auditor` design passes behind
`security.md`.

## Conflicts

`spec.md` wins over everything else here. Where a frozen `discovery/` file disagrees, the spec's
*Agent notes* say which way it changed.
