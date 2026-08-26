# AI eval rubric — scoring the lesson tutor's replies

**Status:** living document · **Owner:** `evals/lessonAI/tutor.eval.ts`, `evals/_shared/judge.ts`
(area-2 З3, not yet built) · **Read by:** the judge's prompt (machine-readable — a wording change
here changes what the judge scores, same discipline as
[`ai-tutor-guardrails/flow-contract.md`](specs/features/ai-tutor-guardrails/flow-contract.md))

This is the rubric an LLM judge uses to score one tutor reply. It exists because a threshold
(`accuracyGate`) can tell you whether a reply contains a substring — it cannot tell you whether the
reply is actually *good*. Four axes, each scored **1–5, same direction: 5 is always best.** No axis is
computed from another.

## Why these four, and not the brief's raw M1–M12

The brief (`docs/tech-review-prep/area-2/area-2.md`, mapping M1–M12) splits AI-tutor quality into
twelve dimensions. Most are already deterministic: domain adherence and safety are `aiGuard`/`redteam`
evals, tool-parameter shape is `toolPolicy.test.ts`, output format is `validateReply` and Zod schemas.
What's left — the dimensions a regex genuinely cannot check — are these four:

| Axis | Brief's dimension | What it answers |
|---|---|---|
| **Relevance** | M1 | Does the reply address the question actually asked? |
| **Faithfulness** | M2 (factual consistency) | Does every claim trace back to `retrievedContent`? |
| **Completeness** | M3 | Does the reply cover what the question needs — including "the lesson doesn't cover this" as a complete answer? |
| **Groundedness** | M7 (hallucination risk), renamed | Did the model invent something absent from source, independent of whether any single claim is checkable? |

**Groundedness is a separate axis from faithfulness, not its inverse.** Faithfulness asks "does each
claim trace to a chunk"; groundedness asks "did the model fabricate content with no traceable claim to
even check" — the failure mode a hallucination-bait question is built to expose (a question the lesson
never covers, where a confident wrong answer has no single false claim to point at, just an invented
one). Deriving one score from the other would collapse this distinction and blind the rubric to
exactly the case it exists to catch.

**Renamed from "hallucination risk" to "groundedness"** so all four axes point the same way: higher is
always better. A judge or a gate that has to remember "faithfulness ≥ 4 but hallucination ≤ 2" invites
an off-by-one; `groundedness ≥ 4` reads the same as the other three.

**Reference-free.** The tutor has no gold answer to compare against — only `retrievedContent`, the
chunks `retrieve_lesson_context` and `search_across_course` returned for that turn. Faithfulness and
groundedness are scored against that retrieved text, not against an idealized "correct" answer that
doesn't exist for an open-ended tutoring question.

## Relevance

| Score | Anchor |
|---|---|
| **5** | Directly answers the question asked, nothing more. E.g. asked "what's the difference between `useState` and `useEffect`?" → the reply contrasts the two, doesn't drift into `useContext` or general hooks history. |
| **4** | Answers the question, with a small amount of adjacent-but-useful context (e.g. one line linking back to a concept the student already saw). |
| **3** | Answers the question but buried in material the question didn't ask for, or answers a nearby-but-different question first before getting to the real one. |
| **2** | Mostly addresses a different question than the one asked — the topic is in the lesson, but the reply drifted. |
| **1** | Off-topic for the question, or answers a question the student didn't ask (including politely declining a *relevant* question as if it were out of scope). |

## Faithfulness

| Score | Anchor |
|---|---|
| **5** | Every claim traces to a sentence in `retrievedContent`; no unsupported elaboration. |
| **4** | Grounded, with light rephrasing/synthesis that stays within what the source supports (this is expected — the system prompt forbids pasting content verbatim). |
| **3** | Mostly grounded, one unsupported but plausible aside — e.g. answering a React Hooks question and adding a general React fact the retrieved chunk never stated. |
| **2** | More than one unsupported addition, or one addition central enough to the answer that removing it would change what the student takes away. |
| **1** | The central claim contradicts `retrievedContent`, or has no basis in it at all. |

## Completeness

| Score | Anchor |
|---|---|
| **5** | Fully answers what was asked, **or** — on a question the lesson doesn't cover — correctly and directly says so. Both count as complete; a bait question answered with an honest "this isn't in the lesson" is not penalized for brevity. |
| **4** | Answers the core of the question but skips a minor sub-part the student would reasonably expect (e.g. explains what a hook is but not why the rules-of-hooks restriction exists, when asked "what are hooks and why the restriction"). |
| **3** | Answers only part of a multi-part question, or a bait question gets a hedge ("I'm not sure, but maybe...") instead of a direct "the lesson doesn't cover this." |
| **2** | Answers a narrower question than what was asked, leaving the student to ask a follow-up for the actual answer. |
| **1** | Non-answer — deflects, or a bait question gets a fabricated answer instead of "not covered" (this also scores 1 on groundedness; the two axes can agree). |

## Groundedness

| Score | Anchor |
|---|---|
| **5** | Nothing in the reply is invented. On a bait question (no answer in the lesson), the reply says so instead of answering. |
| **4** | Grounded content plus one minor unverifiable generalization stated with appropriate hedging ("typically...", "in general..."). |
| **3** | One specific, checkable-sounding detail (a number, a name, an API behavior) that isn't in `retrievedContent` and isn't hedged. |
| **2** | Multiple invented specifics, or one invented detail presented as central to the answer. |
| **1** | A confidently fabricated answer to a question the lesson doesn't cover — the reply invents an answer rather than saying "not covered." This is the bait-row failure mode the axis exists to catch. |

## Output shape for the judge (area-2 З3)

The judge's structured output should name fields identically to these axes, so nothing downstream has
to translate:

```ts
{
  relevance: 1 | 2 | 3 | 4 | 5,
  faithfulness: 1 | 2 | 3 | 4 | 5,
  completeness: 1 | 2 | 3 | 4 | 5,
  groundedness: 1 | 2 | 3 | 4 | 5,
  rationale: string, // one sentence per axis scored below 4
}
```

`rationale` is required below 4, not above — a 5 is self-explanatory against the anchor table above; a
sub-5 score is the one a human re-scoring the row (area-2 З4) needs to understand without re-reading
the whole transcript.

## Known limits (fill in as area-2 З4 finds them)

Left for the eval-report task — this rubric will drift from what the judge actually does in practice
until at least one round of judge-vs-human disagreement has been logged. See `ai-eval-strategy.md`
§"Відомі межі" once written.