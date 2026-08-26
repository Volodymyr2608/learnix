# ADR-031: Evals measure the shipped system, and their numbers survive the run

- **Status**: Accepted
- **Date**: 2026-08-26
- **Amends**: [ADR-013](013-langsmith-tracing-evals.md) §5 and §7

## Context

[ADR-013](013-langsmith-tracing-evals.md) put offline evals in `evals/`, made datasets
version-controlled JSONL, and said in §7 that a prompt change means running `pnpm eval` locally and
posting the score in the PR, with CI gating "a future addition". That was the right shape and it left
two holes that only showed up when the evals were read carefully rather than run.

**The first hole: nothing tied an eval to the prompt it claimed to evaluate.** `lessonAI/tutor.eval.ts`
carried a hand-written copy of the tutor's system prompt. The copy had drifted — it instructed the
model to always call `retrieve_lesson_context`, which the shipped prompt explicitly forbids for
"which lesson covered X" questions, and it omitted the untrusted-data clause entirely. A green
`lessonAI:tutor` therefore described a system that was never deployed. `quizAI/quizGeneration.eval.ts`
had the same defect in a milder form. Neither was a mistake anyone would catch by reviewing a diff:
the copy was correct on the day it was written.

**The second hole: §7's discipline had no artifact.** "Run the eval and post the score" leaves the
previous numbers in terminal scrollback and the comparison in a reviewer's memory. Nobody could
answer "did this prompt change make anything worse" a week later, because the before-number no longer
existed anywhere a diff could reach. The three smallest golden sets held two rows each, on which every
possible score is 0%, 50% or 100% — a threshold on that is decoration.

A third thing was assumed and turned out to be false: that `temperature: 0` makes a run repeatable.
Two consecutive runs of the same dataset against the same prompt hash disagreed by a category.

## Decision

**1. An eval runs the prompt production runs, and this is enforced rather than asked for.**
`evals/_shared/promptFidelity.contract.test.ts` fails any `evals/**/*.eval.ts` that declares its own
system prompt. It matches on the literal's *content* rather than its declaration, because a rule
shaped around `const SYSTEM_PROMPT =` catches only the spelling it was written for — verified against
six ways of re-introducing the defect, five of which a declaration-shaped rule waved through.
Deliberate exceptions are named in `HAND_WRITTEN_BY_DESIGN` with a reason, and the list is re-derived
rather than trusted: an entry whose file no longer has a hand-written prompt fails.

**2. Where a prompt needs assembling, production exports the assembler.** Importing the prompt text is
half the job; the interpolation around it is where the meaning lives. `buildTutorSystemPrompt` is
exported from `lessonAI.agent.ts` and called by both production and the eval, pinned equal by a test.

**3. A run's numbers are committed.** `evals/baselines/<name>.json` records the category counts with
the generator model, the judge model, the prompt hash and the sample count. A later run prints what
moved. This is what §7 asked for and had no mechanism to support.

**4. A comparison refuses to lie.** A baseline taken under a different prompt hash, model, judge or
sample count is reported as not comparable, on its own line, before any category delta. Two runs of
different systems are not a regression, and the most likely reader of a delta is someone who has just
changed the prompt.

**5. Evals measure per category, and gate only where a bar is earned.** `categoryGate` scores each
category separately and gates only those given a threshold. A category with no threshold is a
measurement and cannot turn a run red. Setting a bar on a distribution nobody has observed replaces
the measurement with a guess — the reasoning `aiGuard/redteam` and `aiOutput/falsePositive` already
apply by not gating at all.

**6. Sampling is required, and one draw is not a result.** Each row runs several times at the
temperature production uses, and rows that pass sometimes are reported as their own class. `temperature: 0`
is greedy decoding, not a pure function.

**7. Evals still do not run in PR CI**, and §7's "future addition" is deliberately not taken up. They
cost money, call a third party, and are rate-limited by the account rather than by the code. The
enforcement that *is* free — fidelity and dataset floors — runs in `pnpm test:unit` instead.

**8. Where no assertion can answer the question, an LLM judge scores against a written rubric**
(`docs/specs/ai-eval-rubric.md`), on a different model from the one being judged, with its own output
schema-validated and the text it scores wrapped as untrusted. This is the "one judge configuration"
ADR-013 §5 asked each structured-output feature to own; none existed until now.

## Consequences

**Positive**
- A green eval now means something about the deployed system. Before, two of the evals could be green
  about code that was never shipped.
- The question "did this change make anything worse" is answerable from the diff, by anyone, later.
- Judge scores made visible what the deterministic suite could not: the tutor's `valid` category gates
  at 100% while the judge scores those same replies ~3.9 out of 5.
- Three checks that used to require a careful reader are now contract tests, so the next feature does
  not pay for them again (`docs/constitution.md` §Agent economics).

**Negative / Trade-offs**
- A judged run is rate-limited. The judge prompt carries the rubric, so judging every sample of every
  judged row exceeds the account's per-minute token ceiling; one sample per row is judged, and judge
  scores therefore carry no per-row variance.
- Baselines are committed, so a run that is not recorded leaves the file stale. The comparison names
  the recording date, which makes staleness visible rather than silent.
- The fidelity rule keys on prompts addressing the model in the second person. A prompt written in
  another register would evade it, and the rule would need widening.
- None of this runs in CI, so all of it depends on someone running `pnpm eval` before changing a
  prompt. That is the same dependency ADR-013 §7 already had; what changed is that forgetting is now
  visible in the baseline's date rather than invisible entirely.

## Alternatives considered

**Amend ADR-013 in place.** Rejected: §7's "CI gating is a future addition" is a decision worth
keeping legible as it was made, and points 1–6 add mechanisms rather than correct a mistake. A reader
of ADR-013 should see what was decided in July and follow the link forward.

**Gate on judge scores.** Rejected for now. There is one recorded distribution and no evidence about
where a reasonable threshold sits; a bar chosen today would be a guess that later reads as a standard.

**A second-provider judge (Anthropic) for genuine independence.** Deferred rather than dismissed. The
current judge shares a provider and training lineage with the generator, so a blind spot common to
both would not surface as disagreement. It needs a new environment variable and dependency, which is
its own change with its own ADR.