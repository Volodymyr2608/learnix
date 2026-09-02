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
- Judge scores make visible what the deterministic suite cannot. `low-confidence` satisfies every
  assertion in the suite — 6/6 samples — while the judge scores its faithfulness and groundedness at
  3.0: replies that pick the right tool and avoid every forbidden phrase while being only partly
  grounded in what retrieval returned. `hallucination-bait` is 12/12 with both axes at 3.25. No
  assertion in the suite can express either gap. *(Both were 2.5 and 4.0 on the 2026-08-30 baseline.
  The gap is the point, not its width: on two and four judged samples these move run to run, which is
  why they are measured and never gated.)* (These are measured categories, not gated ones —
  see Decision 5.)
- The two measurements can disagree without either being wrong, which is the case worth understanding
  before trusting a single number, and `missing-info` has now demonstrated it in both directions. It
  failed every deterministic assertion for months — 0/9, the tutor answering a question it had not
  been given the student's code for — while the judge scored what it *did* say as grounded in the
  lesson. The 2026-08-29 prompt made it ask instead: the assertion is 9/9 and the judge dropped to
  1.3 relevance and 1.3 completeness, because a reply that asks rather than answers is what the
  rubric's anchors call incomplete. The assertion measures whether it asked; the judge measures
  whether what it said stood on its own. A suite carrying only one of them would have called this
  change an unambiguous win or an unambiguous regression, and it is neither.
- **Every figure above is in `evals/baselines/lessonAI-tutor.json`**, per category, alongside the
  deterministic counts — see the retraction below for why that matters more than it looks. The
  baseline is re-recorded as the dataset grows, so it, not this prose, is the number: the figures
  here were last reconciled with `evals/baselines/lessonAI-tutor.json` on 2026-09-02, and
  `evals/_shared/docFigures.contract.test.ts` now fails this ADR if the baseline moves and that date
  does not. That check exists because this reconciliation was done by hand three times in two weeks
  and missed something each time.
- Three checks that used to require a careful reader are now contract tests, so the next feature does
  not pay for them again (`docs/constitution.md` §Agent economics).

**A number this ADR originally asserted, and why it was wrong**

**Two** numbers this ADR asserted turned out to be artifacts of how the judge was fed, and both are
kept here rather than quietly edited, because the pattern is the point.

**First: `valid` at ~3.9**, presented as the headline case for having a judge at all. The judge was
handed content *reconstructed* from the dataset row rather than the text the tutor's tools actually
served; for 9 of 24 judged rows the two differed, and cross-lesson rows were graded against "No
relevant content found" while their content sat in a field the reconstruction never read. Given the
served text, `valid` scores 4.9 relevance / 4.8 faithfulness and the gap closes.

**Second: `missing-info` at 1.0**, read as "the tutor invents an answer rather than asking". Those
rows staged no lesson content, so the stub served a placeholder with no facts in it — against which
*any* substantive reply scores 1.0 by construction, whatever the tutor did. With real lesson content
staged, the same rows score 5.0. The replacement finding above is a different and better one.

Both were caught in review, and the second was predicted by the reviewer from the first. The lesson
kept rather than the numbers: **a judge is a measuring instrument, and one fed the wrong input
produces a confident reading indistinguishable from a finding** — twice here, in a single feature, by
someone who had just been burned by it once. That is the argument for recording judge means in the
baseline (Decision 3): a number no committed artifact can contradict is a number that survives on
its author's confidence, and both of these did, for two commits each.

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
