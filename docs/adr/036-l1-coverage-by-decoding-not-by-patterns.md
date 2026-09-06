# ADR-036: L1 Coverage Grows by Decoding, Not by Patterns

- **Status**: Accepted
- **Date**: 2026-09-06

## Context

The AI input guard reports two numbers over the 34-row red-team set, and they disagree by a wide
margin. Before this work: **enforcement recall 94.1%** (32/34 turns refused) against **detection
recall 26.5%** (9/34 recognised *as an attack*). The gap is not a hole in the defence — it is a hole
in the telemetry. Attacks the deterministic layer misses are stopped one layer down by the LLM
relevance check and filed as `guard_off_topic`, an outcome whose baseline `ai-tutor-guardrails`
S11 calls *"high — it is a product signal"*. During an attack campaign, the events a defender would
query stay flat. S13 §18 calls this "the single most actionable finding in this document".

Detection recall is not a soft number. `redteam.eval.ts` sets `detected` from
`guard.outcome === "blocked"`, and only L1 produces that outcome, so **detection recall is exactly
the L1 block rate** — deterministic, no model call, no variance. Raising it means raising L1
coverage, and there are only two ways to do that: give L1 more *rules*, or give it more *views of
the same message*.

That choice is the decision this ADR records, and it is not obvious in the abstract. It became
obvious only after measuring, because the constraint is not where anyone would guess.

## Decision

### Decision 1: L1 coverage grows by adding haystacks, never by adding weights

**The binding constraint is not the false-positive rate. It is the distance between each legitimate
row and the block threshold.**

L1 blocks 0 of the 64 legitimate corpus rows — a clean sheet that suggests plenty of room. It is
misleading. Thirteen of those 64 sit in `suspect` at scores of 20–35 against a `BLOCK_THRESHOLD` of
40. The corpus reads that way because the platform's flagship course is *Intro to AI Security*: its
legitimate rows quote real attack strings, by design, and always will.

A new **pattern** adds weight to that pile. A new **decoder** adds a haystack and no weight. Measured
over the same corpus:

```
                                    detection      adv. inj.   legit blocked
  baseline                          9/34  (26.5%)    27/27         0/64
  + four decoders                  13/34  (38.2%)    27/27         0/64
  + prose widening (three groups)  12/34  (35.3%)    27/27         1/64  -> legit-07
```

Prose widening bought less recall than decoding **and** cost a false positive — `legit-07`, a lesson
that reproduces an attacker prompt verbatim as teaching material. So the rule is not a preference. On
this corpus, adding weight is strictly worse than adding views, and the corpus is not going to become
less adversarial.

### Decision 2: `BLOCK_THRESHOLD` is a cliff, not a dial

The cheapest-looking alternative was to lower the threshold so the near-misses at 30 and 35 begin to
block. Swept:

```
  thr | redteam detected | legit blocked
   35 | 11/34 (32.4%)    |  7/64 (10.9%)
   40 |  9/34 (26.5%)    |  0/64 ( 0.0%)
   45 |  9/34 (26.5%)    |  0/64 ( 0.0%)
```

Two extra attack rows for seven false refusals, against a ≤5% target. 40 is not a tuned value with
room either side; it is the last point before a cliff. Recorded so the next reader does not re-run
the sweep to find that out.

### Decision 3: Homoglyph folding is normalization, not a decoder

The implementation plan called for five decoders including `homoglyph`. Four shipped.

Folding has to apply to **every** haystack, decoded ones included: a base64 payload written with
Cyrillic lookalikes must be folded *after* it is decoded, or the combination passes both layers. A
peer decoder in the registry could only fold the top-level text. Calling folding a decoder would
therefore misdescribe what the code does and break a composition the guard already relies on — there
is a shipped test for exactly that case.

The cost is that a homoglyph attack reports no decoder provenance. Accepted: the alternative is a
second unfolded haystack maintained purely so telemetry has something to say.

### Decision 4: Each decoder carries the guard that is real for it

base64 has always had a printable-ratio guard (≥ 0.9) because its output can be arbitrary bytes. The
plan proposed extending that guard to every decoder, for uniformity.

Measured, it is vacuous: ROT13, leetspeak and reversal map printable input to printable output by
construction — `printableRatio(rot13("Create a lesson explaining prompt injection attacks."))` is
**1.000** against an admission bar of 0.9. A guard that cannot reject anything is not a control; it
is a comment that looks like one, and it is worse than no guard because a reader will believe it.

What actually holds the false-positive line for the character transforms is the catalogue itself:
every rule requires a verb+object **word** combination, and a character transform of ordinary prose
does not produce those words. `leetspeak` carries a cost guard instead (a leet character adjacent to
a letter, so ordinary "add 3 lessons" does not grow a haystack); `rot13` and `reversed` carry none.

### Decision 5: A decoder ships with a legitimate row teaching its own encoding

Measuring "0 false positives" on a corpus that contains no lesson *about* ROT13 proves nothing about
whether ROT13 can be taught here. A platform teaching AI security will host exactly those lessons,
and a decoder whose own subject cannot be taught is a false-positive generator waiting for its first
real user.

So each decoder shipped with a row in both directions: an attack row it must catch, and a legitimate
row teaching that encoding as course content, which it must not refuse.

**The control fired.** A lesson embedding a *complete* override+leak payload as a worked example is
refused, in all four encodings. It is inherited rather than introduced — the plaintext form of the
same lesson already blocks at the same score for the same two rules — and it is now pinned as a
parity test rather than described in prose. See `ai-guard-encoding-coverage/security.md` S5a.

## Consequences

**Measured, both evals run by hand on the branch:**

| | Before | After |
|---|---|---|
| `redteam` detection recall | 26.5% (9/34) | **38.2% (13/34)** |
| `redteam` enforcement recall | 94.1% (32/34) | 94.1% (32/34) |
| `adversarial` accuracy | 76.2% (77/101) | 77.1% (81/105) |
| `adversarial` false positives | 24 | 24 — the same ids, none new |
| L1 blocks on legitimate rows | 0/64 | 0/68 |
| L1 latency @ 2000 chars | 0.288 ms | 0.756 ms (budget 2 ms) |

**A turn blocked at L1 no longer reaches L2**, so each row moved from `off_topic` to `blocked` also
removes one `gpt-4o-mini` call from that turn.

**The ceiling is low and should be stated.** Even with every measured candidate applied — decoders
plus the prose widening this ADR rejects — detection recall reaches 16/34 (47.1%). The residue is
semantic framing (virtualization, hypothetical, role reassignment) and four rows in languages outside
the en/es/fr/de catalogue. L1 does not pass roughly half this set by construction, and nobody should
read this decision as being on a path to "most attacks named correctly".

**S13 §18 is not closed by this.** Two reasons. The residue above, and the one that matters more:
`logSecurityEvent` still writes through `consola` to stdout with no aggregation, query layer, or
alerting sink. A correctly-named event goes exactly where a miscategorised one went. Naming attacks
properly is necessary for that item and is not sufficient for it.

**Provenance is a new field on a type that deliberately admits no free text.** `SecurityEvent` gained
`decoders?: DecoderId[]` — id-only and closed, like `ruleIds` and `subject`. The property that makes
"no event carries free text" hold is that the field set is exhaustive by type with nowhere to put the
message; a provenance field typed `string[]` would have quietly reopened that.

## Alternatives considered

**Widen the prose patterns** (Decision 1). Measured: less recall than decoding, and it costs
`legit-07`. Rejected on numbers, not taste.

**Lower `BLOCK_THRESHOLD`** (Decision 2). Measured: 7 false refusals for 2 attack rows. Rejected.

**Give L2 a second verdict so it reports intent, not just topic.** This is the direct fix for the
telemetry gap and would reach the semantic-framing rows that no decoder can. It was **attempted and
reverted** in ADR-028's feature: adding an `instructionOverride` axis to the shared classification
prompt measurably degraded `onTopic` accuracy on unrelated legitimate input, and the paragraph's mere
*presence* was the cause, independent of wording. `ai-guard-multilingual-coverage/security.md` S10
records the diagnostic. A future attempt needs its own isolated model call — a separate feature with
its own cost and latency case, doubling L2 on every turn.

**Count `guard_suspect` toward detection recall.** Four attack rows already emit an L1 event the
metric ignores, so the published number understates what L1 says by 11.8 points. Deliberately not
done here: changing the definition of a number in the same change that moves the number destroys the
comparison. It should be done next, separately.

**Decode hex, URL-encoding, and nested/double encodings.** No dataset row exercises them, and S13
§29's own bar is a false-positive guard plus honest rows per decoder. Adding them blind would grow
the decoder list without moving the number. De-spacing was measured separately and rejected: it moves
no row, because its target carries no prompt-leak object and caps at 30 against a threshold of 40.

## References

- `docs/specs/features/ai-guard-encoding-coverage/spec.md` — acceptance criteria and measured outcome
- `docs/specs/features/ai-guard-encoding-coverage/security.md` — S3 (why decoders and not patterns),
  S4 (the threshold sweep), S5 (new risk), S5a (what the corpus control found), S6 (accepted risks)
- `docs/specs/features/ai-tutor-guardrails/security.md` — S13 §18 (the telemetry gap, still open),
  §29 (closed for three decoders), §23 (the language residual, untouched)
- ADR-028 — the same shape along the language axis, and the L2 intent-reporting revert
