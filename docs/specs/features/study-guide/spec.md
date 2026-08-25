---
feature: study-guide
status: stable
models: [LessonInsights]
depends-on: [ai-defence-layers, ai-input-trust-boundary]
---

## Purpose

An instructor writes a lesson and asks the platform to distil it into a study guide — a summary, the
key concepts, and a glossary — which students then read alongside the lesson. The generation half
has shipped; the *seeing* half has not. An instructor who clicks "Generate study guide" is told only
that "5 key concepts" and "7 glossary terms" exist, plus a 180-character slice of the summary. They
cannot read what was written under their name, cannot judge whether it is right, and therefore
cannot make an informed decision to regenerate. The one signal they do get — "Last generated
129,188 minutes ago" — is unreadable.

This spec covers the study guide as a whole: how it is generated, what the student sees, and what
the instructor sees. It exists because the instructor-facing half is being completed; the generation
pipeline and the student card are documented here as current behavior, not as new work.

## Functional scope

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
- when the lesson has been saved more recently than the guide was generated, a
  "Content changed — regenerate to update" badge in place of that stamp;
- the full generated guide, always expanded and never scrolled inside the card: the complete summary
  (never truncated) leading at full width, then Key concepts as its own row and Glossary as its own
  row, each splitting into two columns on a wide viewport and stacking on a narrow one. Counts sit
  beside the section labels;
- a hint pointing at the Text Content tab when no guide exists yet;
- a Generate / Regenerate button, disabled while a generation is in flight.

The instructor's view is **read-only**. The only way to change a study guide is to regenerate it;
there is no editing of model-authored text, and no procedure that would accept such an edit.

## Acceptance criteria

Applies: [`docs/constitution.md`](../../constitution.md) — the standing constraints (structure,
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

## Edge cases

- **Stale guide.** When the lesson was saved after the guide was generated, the header shows the
  "Content changed" badge *instead of* the timestamp, but the guide's content still renders — the
  instructor needs to see the stale text to judge whether regenerating is worth it.
- **Cache hit on regenerate.** Clicking Regenerate when the content hash is unchanged returns the
  cached row and leaves `generatedAt` untouched, so the timestamp legitimately does not move. This
  looks like a no-op to the instructor and is the existing, intended behavior.
- **No insights row.** The instructor sees the "no study guide generated yet" state and the hint;
  the student sees nothing at all.

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