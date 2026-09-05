---
feature: study-guide
status: stable
models: [LessonInsights]
depends-on: [ai-defence-layers, ai-input-trust-boundary]
---

## Description

A study guide is a generated companion to a lesson: one paragraph of summary, 3–7 key concepts with
one-sentence explanations, and a glossary of terms. An instructor generates it from the lesson
editor; students read it beside the lesson on the learn page. One `LessonInsights` row per lesson,
regenerated rather than edited.

This spec covers the study guide as a whole: how it is generated, what the student sees, and what
the instructor sees. The generation pipeline and the student card are documented here as current
behavior, not as new work.

## Business goal

An instructor writes a lesson and asks the platform to distil it into a study guide, which students
then read alongside the lesson. The generation half shipped first; the *seeing* half did not. An
instructor who clicked "Generate study guide" was told only that "5 key concepts" and "7 glossary
terms" existed, plus a 180-character slice of the summary. They could not read what was written
under their name, could not judge whether it was right, and therefore could not make an informed
decision to regenerate. The one signal they did get — "Last generated 129,188 minutes ago" — was
unreadable. Model-authored text published under an instructor's name that the instructor cannot read
is the problem this closes.

## Supported use cases

**Generation (instructor).** `lessonInsightsAI.generateLessonInsights` takes a lesson id, runs three
parallel chains (`summary`, `concepts`, `glossary`) over the lesson's text content wrapped as
untrusted, and upserts one `LessonInsights` row per lesson. The row stores the summary, `concepts`
and `glossary` as Json, the model id, a sha256 `contentHash` of the lesson content, and
`generatedAt`. A regeneration whose `contentHash` matches the stored row and whose stored `concepts`
parse to a non-empty list is served from cache without a model call; anything else regenerates and
heals the row. A lesson with no text content is refused with `BAD_REQUEST`.

**Student view** (`StudyGuideCard`, on the course learn page). Renders the guide in collapsible
sections: Summary (open by default), `Key Concepts (N)`, and `Glossary (N)` (hidden entirely when
there are no terms). Renders nothing at all when the lesson has no insights row.

**Instructor view** (`StudyGuideToolbar`, on the lesson editor). One card above the
Video / Text / Resources / Quiz tabs, showing:

- a header with a "Last generated <relative time>" stamp, expressed in whatever unit reads naturally
  for the elapsed distance — minutes, hours, days, months;
- when the guide is stale — the stored hash no longer matches the lesson text, or the lesson was
  saved after the guide was generated — a "Content changed — regenerate to update" badge in place of
  that stamp;
- the full generated guide, always expanded and never scrolled inside the card: the complete summary
  (never truncated) leading at full width, then Key concepts as its own row and Glossary as its own
  row, each splitting into two columns on a wide viewport and stacking on a narrow one. Counts sit
  beside the section labels;
- a hint pointing at the Text Content tab when no guide exists yet;
- a Generate / Regenerate button, disabled while a generation is in flight **and** whenever
  regenerating would do nothing — i.e. the stored `contentHash` still matches the lesson's current
  text — with a line beside it saying why.

The instructor's view is **read-only**. The only way to change a study guide is to regenerate it;
there is no editing of model-authored text, and no procedure that would accept such an edit.

## Unsupported use cases

- **Editing the generated text.** There is no procedure that accepts an edit to a summary, a concept
  or a glossary entry; the only way to change a guide is to regenerate it. A stored guide is
  therefore always exactly what the model wrote from a known `contentHash`, which is what makes the
  staleness signal meaningful.
- **Regenerating one section.** The three chains run as a unit and the row is upserted whole; there
  is no "just redo the glossary".
- **Rendering model text as markdown.** Deliberate, and load-bearing: the `off_origin_link` rule is
  recorded `n/a` for this surface in `aiSurfaces.ts` precisely because both views render plain text
  nodes (criterion 10).
- **Generating from anything but the lesson's own text.** No video transcript, no attached resource,
  no other lesson — a lesson with no text content is refused rather than assembled from neighbours.

## Inputs

Station numbers refer to [`../ai-flow-contracts/chain-contract.md`](../ai-flow-contracts/chain-contract.md)
§lessonInsightsAI, which holds the per-step detail.

**Trusted — server-derived, never read from request input.**

- `instructorId` / `userId` from the session (stations 1, 15). Both the ownership filter and the
  rate-limit key derive from it.
- `lessonId` arrives as tRPC input but is only usable *after* the ownership query at station 4 — the
  query that authorizes is the query that fetches.

**Untrusted — three channels.**

| Channel | Enters at | Boundary |
|---|---|---|
| Lesson text content | instructor-authored, station 7 | `wrapUntrustedContent(…, "lesson_content")`; each of the three system prompts carries `UNTRUSTED_DATA_CLAUSE` |
| Stored `concepts` read back | model-authored JSON, station 14 | `parseStoredConcepts` at the repository boundary — element lengths bounded, malformed value → `[]` + one telemetry event, never a throw |
| Stored `glossary` read back | model-authored JSON | parsed **in the browser** by `lib/parse/parseGlossary`; malformed entries are dropped. See Observability for what this position costs |

## Outputs

- **One `LessonInsights` row per lesson** (station 13) — `summary`, `concepts` and `glossary` as
  Json, the model id, the sha256 `contentHash` of the text it was generated from, and `generatedAt`.
  Upserted, never appended to.
- **`getLessonInsights`** returns that row plus `matchesCurrentContent` — the server's answer to
  "would regenerating do anything", which the client cannot compute because it never sees the lesson
  text the hash was taken over.
- **Two rendered views**, both plain text: `StudyGuideCard` (student, collapsible, hidden entirely
  when there is no row) and `StudyGuideToolbar` (instructor, always expanded, read-only).
- **Three downstream consumers that are not the study guide**: the lesson tutor builds its
  `mark_concept_understood` allowlist from `concepts`, the quiz service seeds concept mastery from
  it, and `learningPathAI` reads the row. A change to the stored shape is never local to this
  feature.

## Validation

**1. Input** (stations 1–4): `instructorProcedure` → `aiRateLimit("lessonInsightsAI")` → Zod on the
lesson id → the ownership query itself. A lesson with no text content is refused `BAD_REQUEST`
rather than sent to the model.

**2. Generation** (stations 8–10) — one schema per chain, and the bounds are the contract:
`SummarySchema` 40–800 characters; `ConceptsSchema` 3–7 entries, name ≤ 80, explanation 10–300;
`GlossarySchema` **0**–15 entries, so an empty glossary is valid output rather than a failure.

**3. Model output** (station 12): `validateModelText` over every field about to be persisted —
summary, each concept name and explanation, each glossary term and definition. **Report-only**
(decision D-M, measured 9.5% false positives on this surface, almost all `untrusted_data_echo` from
lessons that legitimately discuss the wrapper tag). It emits an event and does not stop the write.

**4. Read** (station 14): `parseStoredConcepts` is the boundary every consumer inherits — the
repository returns a parsed array, so no caller can `.map` over raw Json. It bounds element length
but deliberately **not** cardinality: 3–7 is a generation-time rule, and enforcing it on a read would
make a row written under a different rule unreadable. `null` is absence, not corruption, and emits
nothing.

**5. Cache** (station 6): a stored row is served only when `contentHash` matches **and** the parsed
concepts are non-empty. The second half is not redundant — without it a row whose concepts failed
the read boundary would short-circuit its own replacement forever, since the hash still matches.

## Acceptance criteria

Applies: [`docs/constitution.md`](../../../constitution.md) — the standing constraints (structure,
style, error handling, security, testing) are inherited, not retyped here — plus:

1. A guide generated 3 minutes ago reads "Last generated 3 minutes ago"; one generated 90 days ago
   reads in months ("3 months ago"), never "129,188 minutes ago". No elapsed distance renders a
   count above ~60 of any unit.
2. The relative stamp comes from the existing `lib/utils/date/relativeTime.ts` helper, not from a
   second hand-rolled formatter.
3. The instructor's card renders the complete summary text — a summary longer than 180 characters
   appears in full, with no ellipsis.
4. Every stored concept appears in the instructor's card with its name and, when present, its
   explanation. A concept whose `explanation` is absent renders its name without an empty paragraph.
5. Every stored glossary entry appears in the instructor's card with its term and definition.
5a. Two concepts sharing a name — or two glossary entries sharing a term — both render. Names and
    terms are model-authored and no schema in the pipeline constrains them to be distinct, so they
    cannot be React keys on their own; `keyedByLabel` suffixes repeats (`Closure`, `Closure#2`).
    Without it React drops the colliding sibling while the count beside the heading still counts it,
    breaking 4, 5 and 6 at once.
6. The concept and glossary counts shown to the instructor equal the number of entries actually
   rendered — one source, not a separately computed badge that can disagree with the list.
7. The glossary section is omitted (not rendered empty) when the lesson has no glossary terms; the
   concepts section is not, since a guide with zero concepts is a defect worth showing.
8. A `glossary` column holding a non-array, or an array with malformed entries, renders the entries
   that are well-formed and drops the rest — it never throws in the browser. This is the same fail
   direction `parseStoredConcepts` already takes for `concepts`.
9. Both study-guide views read the same parsed shape; neither casts raw Json straight into a `.map`.
10. Model-authored text (summary, concept names and explanations, glossary terms and definitions)
    renders as plain text in both views. It is not passed through the markdown renderer, which is
    the standing assumption behind the `off_origin_link: n/a` entry for this surface in
    `aiSurfaces.ts`. Already enforced repo-wide by
    `app/_components/_shared/markdown/renderers.contract.test.ts`, which asserts set-equality
    between the files importing `react-markdown` and `RENDERER_POLICY` — a study-guide component
    that started rendering markdown fails that test by name.
11. `getLessonInsights` keeps its existing authorization: the lesson's instructor or a non-cancelled
    enrollee, and `null` for anyone else. No new procedure is added.
12. `pnpm typecheck` and `pnpm check` pass; the new parse helper has unit tests covering the
    well-formed, partially-malformed, and non-array cases.
13. The relative stamp never throws. `formatDistanceToNow` raises `RangeError` on an invalid date
    and this runs inside a React render, so an unparseable `generatedAt` degrades to a plain label
    rather than blanking the lesson editor. The stamp is also clamped to now, so a browser clock
    trailing the server does not render a just-generated guide in the future tense.
14. `getLessonInsights` returns `matchesCurrentContent`: true when the stored `contentHash` equals a
    fresh hash of the lesson's current text **and** the stored concepts survived the read boundary.
    The second half mirrors `generateForLesson`'s cache condition exactly — a row whose concepts
    parse to `[]` is a cache *miss* there, so it must not read as up to date here, or the one action
    that heals the row would be the one disabled.
15. Both call sites hash through the same `lessonContentHash` function. A second inline
    `createHash` is a silent drift: the write side and the read side would disagree about the same
    lesson, and the button would lie in one direction or the other.
16. The Regenerate button is disabled exactly when a guide exists and is not stale, with the reason
    rendered beside it. Staleness is the *union* of the server's `matchesCurrentContent` and the
    client's `lastSavedAt` comparison: the first is authoritative and survives a page reload, the
    second covers the window after a save where the query has not yet refetched.
17. Glossary rules separate entries and do not close the block: no rule sits under the last row, in
    either one or two columns. `:last-child` cannot express this — with an even number of terms the
    bottom-left entry is not the last child and would draw half a line across the card.

## Edge cases

- **Stale guide.** When the lesson was saved after the guide was generated, the header shows the
  "Content changed" badge *instead of* the timestamp, but the guide's content still renders — the
  instructor needs to see the stale text to judge whether regenerating is worth it.
- **Cache hit on regenerate.** `generateForLesson` short-circuits on a matching `contentHash` and
  returns the stored row without calling the model — no new text, and `generatedAt` untouched. The
  button previously stayed enabled through all of that and reported "Study guide generated.", so it
  claimed work it had not done; the guide's own author had to read the service to find out why
  nothing changed. The button is now disabled on that state instead, which is why
  `getLessonInsights` carries `matchesCurrentContent`.
- **No insights row.** The instructor sees the "no study guide generated yet" state and the hint;
  the student sees nothing at all.

## Failure & fallback

The per-scenario matrix is
[`../ai-flow-contracts/chain-contract.md`](../ai-flow-contracts/chain-contract.md)
§"lessonInsightsAI — failure matrix", nine rows, and is not duplicated here. The decisions behind it:

**Generation is all-or-nothing.** The three chains run under `RunnableParallel` with
`withRetry({ stopAfterAttempt: 2 })`; if any one of them fails or returns output its schema rejects,
the whole generation fails and **no row is written**. There is no partial guide — a summary without
concepts would satisfy the read path and quietly become the tutor's empty allowlist.

**The rate limiter fails closed** (`TOO_MANY_REQUESTS`, ADR-027); the output boundary is
**report-only** and cannot fail the write. Those two directions are chosen per dependency: an open
limiter is unbounded model spend, while a blocked generation produces no error an instructor could
act on — it simply yields no study guide, at a measured 9.5% false-positive rate.

**Corruption degrades, never throws.** A malformed stored `concepts` becomes `[]` at the repository
boundary, which is the safe direction for every consumer: the tutor's allowlist goes empty and
`toolPolicy` denies every mastery write, the quiz service under-grants rather than over-grants, and
the guide renders degraded. It also reads as a cache *miss*, so regenerating heals the row — which
is why `matchesCurrentContent` must not report such a row as up to date, or the one action that
heals it would be the one disabled.

**A malformed `glossary` degrades silently**, in the browser, with no event. That is the one
fallback here that is worse than its sibling, and it is a stated cost rather than an oversight — see
Observability.

## Security

No new authority and no control touched — `pnpm classify` reports `STANDARD-OR-DIRECT`, so no design
pass was run. This surface is already registered in
`server/services/_shared/conformance/aiSurfaces.ts` under `lessonInsightsAI`, and its controls are
inherited by reference from [`../ai-defence-layers/spec.md`](../ai-defence-layers/spec.md) and its
[`security.md`](../ai-defence-layers/security.md): lesson content is wrapped
(`wrapUntrustedContent`), the output boundary runs report-only per decision D-M, and
`generateLessonInsights` stays behind `instructorProcedure`.

The one inherited control this change could break is the `off_origin_link` rule, recorded as
`NOT_RENDERED_AS_MARKDOWN` for this surface. That entry is a claim about the *render* path, and this
change adds a second render path — hence acceptance criterion 10.

## Performance

**Enforced today, with the value in code:**

- Rate limit (ADR-027, Redis-backed, fail-closed): `lessonInsightsAI` **10 requests/min per user**,
  inside the cross-feature aggregate of **30/min**.
- Model: `gpt-4o-mini`, temperature **0**, `MODEL_TIMEOUT_MS` **30 s** per call, `MODEL_MAX_RETRIES`
  **2**.
- **Three model calls per generation**, run in parallel, plus `withRetry({ stopAfterAttempt: 2 })`
  around the trio — so the worst case for one accepted request is six calls, and the wall-clock
  worst case is bounded by the slowest chain rather than their sum.
- Output bounds double as cost bounds: summary ≤ 800 characters, ≤ 7 concepts, ≤ 15 glossary
  entries.
- The `contentHash` cache is the real saving: regenerating an unchanged lesson costs **zero** model
  calls.

**Measured since 2026-09-03** — [`ai-observability`](../ai-observability/spec.md), ADR-035: each of
the three parallel calls emits its own `latencyMs`, `promptTokens`, `completionTokens` and `costUsd`,
and the generation emits one turn line. The per-call split is what makes the parallel trio readable:
`wallMs` for the turn is the slowest of the three, while `costUsd` is the sum of all three, and a
single number would have conflated them.

**No structural token ceiling, and the input side is unbounded in a way the others are not** — a
lesson body has no length cap before it reaches the prompt, so the cost of one generation scales with
how much an instructor wrote, and the trio multiplies that input by three. The output bounds (summary
≤ 800 characters, ≤ 7 concepts, ≤ 15 glossary entries) cap only the completion side; the
`contentHash` cache is what actually bounds spend over time.

**p95 targets set 2026-09-05** — one structured call ≤ 2 000 ms, derived from a measured per-call
baseline in [`ai-observability`](../ai-observability/spec.md) §Performance. **Still not set:** the
per-generation cost ceiling, which needs usage patterns rather than latency.

## Observability

- **Output boundary** (station 12) — `validateModelText` emits through the shared taxonomy with
  `feature: "lessonInsightsAI"`, `subject: { kind: "lesson", id }`. One event per turn, not per
  field: the first hit is the signal and the rest are the same finding repeated. Report-only, so the
  event is the *only* effect.
- **`stored_concepts_malformed`** — emitted by `parseStoredConcepts` when a stored value fails the
  read boundary. Baseline zero, so any occurrence is the signal. A `null` column emits nothing:
  absence is the default state for most lessons, and one bogus event per lesson per listing would
  bury the real signal in the channel this feature exists to populate.
- **No event carries lesson text, summary text, or a concept name** — the shared event type has no
  field to put them in.
- **The trace label and the security label disagree, deliberately-by-accident.** `traced()` tags this
  span `feature: "summary"` while security events use `lessonInsightsAI`. Anyone joining LangSmith
  traces to security events has to know that; it is recorded here rather than fixed on this branch.

**The gap, named.** `glossary` is parsed in the browser, so a corrupted glossary column degrades
silently — `parseGlossary` cannot emit a security event from there. Its sibling column is
instrumented precisely to populate that channel. The signal comes back when the parse moves to the
repository boundary, and that move is the trigger for adding it (see Agent notes for why it was not
done here).

## Test & eval scenarios

Tests run in PR CI; **evals never do** — they are the manual gate before a prompt changes.

| Group | Level | File |
|---|---|---|
| Authorization on both procedures (instructor-only generate; instructor-or-enrollee read) | integration | `lessonInsightsAI.authz.integration.test.ts` |
| Cache miss and the self-healing empty-concepts row | integration | `cacheMiss.integration.test.ts` |
| `matchesCurrentContent` — the up-to-date signal behind the disabled button | integration | `upToDate.integration.test.ts` |
| Output boundary runs over every persisted field, report-only | integration | `outputBoundary.integration.test.ts` |
| Lesson content is wrapped before it reaches a prompt | unit | `lessonInsightsAI.wrap.test.ts` |
| Hash agreement between the write and read paths | unit | `contentHash.test.ts` |
| Read boundary: well-formed, partially malformed, non-array | unit | `lib/parse/parseGlossary.test.ts`, and `parseStoredConcepts` via its own suite |
| Toolbar staleness, relative stamp, duplicate-label keys | unit | `StudyGuideToolbar/utils.test.ts` |
| Model text never reaches the markdown renderer | contract | `app/_components/_shared/markdown/renderers.contract.test.ts` |
| Every station, tool and chain documented | contract | `chainContract.contract.test.ts` |

**Evals**: `pnpm eval lessonInsightsAI:lessonInsights` (`evals/datasets/lessonInsightsAI/lessonInsights.jsonl`) —
generation quality against sample lessons. The adversarial side is covered by the shared
`aiOutput:falsePositive` set, which is where this surface's 9.5% figure comes from; there is no
study-guide-specific injection set, and a prompt change to one of the three chains has no eval that
would catch a regression in the other two.

## Source of truth

`documentation-process.md` §1a is the standing rule; for this feature:

- **Behaviour now** — this file.
- **Step-by-step contract** —
  [`../ai-flow-contracts/chain-contract.md`](../ai-flow-contracts/chain-contract.md)
  §lessonInsightsAI, 15 stations, enforced by `chainContract.contract.test.ts`.
- **Controls** — inherited by reference from [`../ai-defence-layers/`](../ai-defence-layers/spec.md)
  and its `security.md`; the per-surface claim register is
  `server/services/_shared/conformance/aiSurfaces.ts`, re-derived from source by its own contract
  test.
- **Decisions** — ADR-026 (shared defence layers), ADR-027 (distributed rate limiter). No ADR is
  owned by this feature: nothing here cleared the three-month test.
- **Correctness** — the tests and eval above.
- **Build history, frozen** — `build/plan.md`.

## Agent notes

- **`ConceptList` and `GlossaryList` are shared by both views**, and they look deliberately unlike
  each other: a concept is something the lesson teaches, so it is a filled tile with a left accent
  rule and prose; a glossary term is something you look up, so it carries no fill and is ruled off
  beneath, like a dictionary. Collapsing them into one generic list component would erase a
  distinction the reader uses to tell the two sections apart at a glance. Column count is a prop the
  *caller* sets — the instructor's row-width sections pass `columns={2}`, the student's narrower
  indented card takes the default of 1.

- `LessonInsights.concepts` is parsed at the repository boundary by
  `parseStoredConcepts`; `glossary` is **not** — it reaches every consumer as raw
  `Prisma.JsonValue`. `learningPathAI`'s `mergeAndExplain` node passes that raw value through, so
  moving the glossary parse into `lessonInsightsRepository.findByLessonId` would change what that
  node sees. The client-side parse keeps this change out of the AI services; a later move to the
  repository boundary is the better home for it and should be done deliberately, not as a
  side effect.

  **What the interim position costs, stated plainly:** `parseStoredConcepts` emits a
  `stored_concepts_malformed` security event when it drops a value. `parseGlossary` runs in the
  browser and therefore cannot — a corrupted `glossary` column degrades silently in both views, on
  a feature whose sibling column is instrumented precisely to populate that channel. This is
  accepted rather than overlooked: the alternative was a repository-boundary change reaching into
  `learningPathAI` on a branch whose classifier verdict was "no control touched". The signal comes
  back when the parse moves to the boundary, and that move is the trigger for adding it.

- **The `columns` prop is the pragmatic seam, not the ideal one.** It resolves to `md:grid-cols-2`,
  a *viewport* breakpoint, while the real constraint is how wide the list's container is — the
  student's card is narrow because it sits in an indented section, not because the window is small.
  A `@container` query (this repo already uses them, e.g. `ui/card.tsx`) would delete the prop and
  make both call sites correct by construction. It was not done here because it would also change
  the student card's layout, which this change deliberately left alone.
- Three other consumers read this row — the lesson tutor (`lessonAI.service`), the quiz service
  (concept mastery seeding), and `learningPathAI`. A change to the stored shape is never local to
  the study guide.
- `generateForLesson` returns two different shapes: the cache hit returns a `LessonInsightsRow`
  (parsed concepts), the miss returns the raw upsert result. Callers that only invalidate the query
  afterwards — the current toolbar — are unaffected, but a caller that reads the mutation's return
  value would be.