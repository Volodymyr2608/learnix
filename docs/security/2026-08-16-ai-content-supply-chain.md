# Cross-flow review — instructor content as an AI supply chain

**Date:** 2026-08-16 · **Method:** code reading, no execution, no evals run

**Scope:** the path content takes from the moment an instructor writes it — by hand or through the
AI course builder — to the moment it reaches a *different* person's model context: the lesson tutor,
lesson insights, quiz generation, the learning path, and another instructor's builder.

The tutor has a threat model of its own
([`features/ai-tutor-guardrails/`](../specs/features/ai-tutor-guardrails/)), reviewed separately in
[`2026-08-16-ai-tutor-independent-review.md`](./2026-08-16-ai-tutor-independent-review.md). This
document deliberately looks at the seam **between** features, because that is where no single spec
is responsible.

---

## The frame

**Every write surface in this system is unguarded, and that is correct.** An instructor typing a
lesson body is not attacking anything — it is their course, and `guardUserInput` on the editor would
block a legitimate AI-security lesson from being written at all. The platform's defence is entirely
**read-side**: `wrapUntrustedContent` at each consumer, plus the authority and output boundaries.

That choice is sound, and it has one consequence worth stating plainly: **the trust boundary is not
where the text is written, it is where it is read** — and every consumer must therefore be correct
independently, forever, including consumers that do not exist yet. A supply-chain review is the only
review shaped like that risk.

The question this document asks at every hop is the same one: *does text authored by person A reach
a model whose output is shown to person B?*

## The content graph

```
                     ┌── (hand-written in the lesson editor)
lesson.content ──────┤
                     └── (drafted via courseAI, then edited)
      │
      ├─→ chunker ─→ LessonChunkEmbedding ─┬─→ retrieve_lesson_context ─→ tutor ─→ STUDENT
      │                                    └─→ search_across_course ────→ tutor ─→ STUDENT
      │
      ├─→ lessonInsightsAI ─→ LessonInsights.concepts
      │         │
      │         ├─→ tutor toolPolicy ALLOWLIST ─→ ConceptMastery ─→ STUDENT's record
      │         │                                       │
      │         │                                       └─→ learningPathAI ─→ STUDENT
      │         └─→ StudyGuideCard ────────────────────────────────────────→ STUDENT
      │
      └─→ quizAI ─→ Quiz rows ─→ QuizPlayer ─────────────────────────────→ STUDENT

lesson.title ─────→ get_student_progress, search_across_course ──────────→ STUDENT
course.title/subtitle ─→ CourseEmbedding ─→ search_similar_courses ─→ ANOTHER INSTRUCTOR's builder
```

Three of these hops cross a person boundary: everything into the tutor and the study guide
(instructor → student), `ConceptMastery` (instructor's vocabulary → student's regulated record), and
`search_similar_courses` (instructor A → instructor B). The last is the only **cross-tenant** hop in
the system, and it gets the most attention below.

---

## Findings

### C1 — courseAI's cross-tenant containment is real, load-bearing, and pinned by nothing

**Severity: Medium now, Critical if it regresses** · `graph/nodes/chatResponse.ts`, `toolRouter.ts`,
`graph/state.ts`

`search_similar_courses` returns **other instructors'** titles and subtitles
(`searchSimilarCourses.ts`). `entryPoints.ts` already calls it "the widest untrusted surface here,
since the author of this text is not even the person running the generation." So the obvious attack
is: instructor A publishes a course whose title carries an injection, instructor B's builder
retrieves it, and B's assistant is steered.

**I traced it, and it does not reach B's screen.** The containment is structural:

- Tool results land in `state.messages` (`toolRouter.ts` returns `{ messages: [response] }`).
- `chat_response` builds its messages from `state.content`, `state.history` and `state.userMessage`
  — **it never reads `state.messages`**.
- The route streams `on_chat_model_stream` only for `chat_response` and `clarify`
  (`STREAMING_NODES`), so `tool_router`'s own text is never sent to the client.
- `extract_step_data` reads `state.assistantText` (i.e. `chat_response` output), not tool results.
- The four tools have **no network egress**: two read our own database, one returns a static
  taxonomy, one calls our own model. There is no argument through which data leaves.

So a successful injection at this hop can influence *which tool the router calls next and with what
arguments* — and nothing else. That is a genuinely well-contained design, and it deserves to be
recorded as such rather than rediscovered by the next reviewer.

The problem is that **not one line of code or test says this is deliberate.** `chat_response` not
reading `state.messages` looks like an omission, and it is the kind of omission a future "ground the
reply in the retrieved examples" improvement would fix — turning a contained channel into
instructor-A-to-instructor-B injection, landing in a component that renders markdown without a URL
transform (C3). That combination is zero-click exfiltration of instructor B's course draft.

**Fix.** Make the invariant explicit and cheap to keep:

1. A comment in `chatResponse.ts` stating that tool results are deliberately excluded, and why.
2. A test in `graphContract.contract.test.ts` asserting `chat_response` does not consume
   `state.messages`.
3. If grounding in tool results is ever wanted, it arrives *with* an output boundary
   (`validateReply`-equivalent) and a `urlTransform` on the builder's renderer — as one change, not
   two.

---

### C2 — `mergeAndExplain` interpolates instructor-derived text outside the wrapper

**Severity: Medium** · `learningPathAI/nodes/mergeAndExplain.node.ts` (`buildPromptMessages`)

```ts
const humanContent = `Candidate steps: ${wrapUntrustedContent(JSON.stringify(enrichedCandidates), "path_candidates")}
Weak concepts: ${JSON.stringify(state.weakConcepts)}
Completed lesson IDs: ${JSON.stringify(state.completedLessonIds)}
…
```

`enrichedCandidates` is wrapped. `state.weakConcepts` on the next line is not — and its rows carry
`concept`, which originates in `LessonInsights.concepts`, i.e. an LLM extraction of the instructor's
lesson body. Instructor-authored text sits in the prompt with nothing between it and the
instructions, one line below a region that was carefully isolated.

The remaining two interpolations are ids and are fine. `reflectAndCheck.node.ts` gets this right —
it wraps `weakConcepts` inside its `path_candidates` region.

**This is the exact defect class S13 §15 predicts.** The file *is* registered in
`GUARDED_ENTRY_POINTS`, so `entryPoints.contract.test.ts` is green: the contract test checks
registration, not completeness. Registration proves the module knows about wrapping; it proves
nothing about the field you are looking at.

**Residual impact is genuinely limited**, and the reason is instructive: `semanticValidate` re-checks
every returned step against server-held state — `lessonId` must belong to the course, a
`REVIEW_LESSON` must be completed, a `RETRY_QUIZ` must match a quiz the student actually failed — and
it retries up to 3 times before throwing. So an injection cannot fabricate steps pointing anywhere.
What it can influence is the free text: `summary` and each step's `reason`. Those render as plain
React text nodes in `LearningPathCard` and are escaped, so the ceiling is misleading study advice
attributed to the platform. Real, bounded, not urgent.

**Fix.** Wrap it, and treat "one wrapped field, one raw field, same prompt" as a review smell:

```ts
Weak concepts: ${wrapUntrustedContent(JSON.stringify(state.weakConcepts), "path_candidates")}
```

Then strengthen the tooling, because the next instance will look identical: extend
`entryPoints.contract.test.ts` (or add a sibling) to walk template literals in registered files and
fail on an interpolation of a known-untrusted state field outside a `wrapUntrustedContent(` call.
That is the "completeness" half §15 says is missing, scoped small enough to actually build.

---

### C3 — Three student-facing render paths have no URL policy

**Severity: Medium (privacy/tracking, not XSS)** · `CourseLearnView/index.tsx:46-52,152-155,272` ·
`AIChatBuilderDialog/…/ChatMessage/index.tsx:45`

The tutor spent real effort closing the zero-click image channel: `validateReply` pre-filters
off-origin destinations server-side, and `inAppUrlTransform` enforces it on the parsed AST because
regexes cannot keep up with CommonMark. Three other paths render instructor- or model-authored
content with no equivalent:

| Path | Renders | Author | Policy |
|---|---|---|---|
| `CourseLearnView` → `MarkdownContent` | `lesson.content` | instructor | bare `<Markdown>` |
| `CourseLearnView` | `<source src={lesson.videoUrl}>` and `<a href={resource.url}>` | instructor | none — `videoUrl`/`url` are `z.string()` with no parsing |
| builder `ChatMessage` | assistant text | model (steered by course data) | bare `<ReactMarkdown>` |

**This is not XSS.** react-markdown's default `urlTransform` sanitises protocols, so `javascript:`
in markdown is dropped; React blocks `javascript:` in `href`. Rating it higher than it is would be
wrong.

What it *is*: `![](https://attacker.example/px.png)` in a lesson body loads with no click for every
student who opens that lesson, disclosing viewer IP, user-agent, referer and precise timing to a
third party — a per-lesson analytics beacon the platform neither sees nor consents to. On a platform
processing minors' data (S12) that is a GDPR problem more than a security one, and it is the same
threat (`threat-model` R2) the tutor treats as serious.

Note the asymmetry this creates: the tutor refuses to *emit* an off-origin image, while the lesson
body one scroll above it renders one freely. An attacker in the instructor role has no reason to go
through the tutor at all.

For `resource.url` and `videoUrl` the control is currently "React happens to block `javascript:`" —
a framework-version-dependent behaviour, not a decision.

**Fix.** Promote `inAppUrlTransform` out of `LessonAssistant/utils.ts` into a shared module and apply
it to all three markdown renderers. Validate `videoUrl` and `resources[].url` with
`z.string().url()` plus a protocol allowlist at the DTO. If instructors legitimately need remote
images, that is a product decision — make it one, with an explicit host allowlist, rather than
leaving it as an accident of which component someone happened to harden.

---

### C4 — The quiz answer key defeats the tutor's own level-3 integrity argument

**Severity: Medium** · `quiz.service.ts:82-85` + `toolPolicy.ts:28`

Two facts, each already known separately, that nobody has put next to each other:

- `quiz.service.getByLesson` returns `{ ...quiz, attempt }` to any enrolled student — including
  `correct`. Filed in S13 §11 as "not an AI surface; found while auditing the indexing channel."
- `CONVERSATION_MAX_LEVEL = 2` exists because, in the words of S7, level 3 must be
  "**confirmation by action, not by text**" — reachable "only by answering every quiz on the lesson
  correctly."

The action is not confirmation if the answers are in the response payload. A student can read
`correct` from the network tab, answer every quiz, and reach level 3 on every concept in the lesson
— the precise outcome the conversation ceiling, the allowlist, and the monotonic upsert exist to
prevent. `learningPathAI` then reads those rows and stops recommending review.

This is the strongest argument in this document for reviewing across features rather than within
them: §11 is correctly classified as "not an AI surface" and correctly rated low **on its own
terms**. Its severity comes entirely from a guarantee made in a different feature's spec.

**Fix.** Strip `correct` from the student-facing shape and grade server-side (the grading path
already exists — `QuizAttempt.isCorrect` is computed server-side). Return `correct` only in the
instructor shape and in a student's post-attempt review. Then S13 §11 can close and S7's level-3
claim becomes true.

---

### C5 — Instructor content that feeds the AI pipeline has no length cap

**Severity: Medium (cost/DoS)** · `server/entities/lesson/index.ts:14-31`

```ts
title: z.string().min(1, "Title is required"),
description: z.string().nullable().optional(),
content: z.string().nullable().optional(),
```

No `.max()` anywhere. `lesson.content` flows straight into `chunkLessonContent` and then into
`model.embedDocuments(chunks)` on every save (`lesson.service.ts:96-98`), so a single instructor
request can trigger an unbounded number of embedding calls. `videoUrl` and `resources[].url` are
equally unbounded and unparsed.

ADR-017 Rule 7 requires capping user-controlled string lengths on AI-calling endpoints. The rule was
written with the chat routes in mind — and it is enforced there — but `lesson.update` is not an
"AI-calling endpoint" by its own signature. It just happens to start an AI pipeline as a side effect.

Two follow-on notes on the same pipeline:

- `embedLessonChunks` runs regardless of the course's publication status, while `embedCourse` is
  gated on `status === "published"` and `removeCourseEmbedding` runs on unpublish. Draft lesson
  chunks are therefore indexed. No exposure follows today — retrieval is scoped to an enrollment,
  and enrollment implies a published course — but the two halves of the same index follow different
  rules for no stated reason.
- Soft-deleted lessons keep their chunk rows; both retrieval queries filter `l.deleted_at IS NULL`
  at read time. Correct today, and it means the filter can never be dropped.

**Fix.** Cap `content` (e.g. 200 KB), `title`, `description`, and the URL fields at the DTO; apply
the publication gate to lesson chunks for symmetry; and add "does this write start an AI pipeline?"
to the Rule 7 checklist so the next such endpoint is caught by the rule rather than by a reviewer.

---

### C6 — An instructor's text becomes the vocabulary of a student's regulated record

**Severity: Low-Medium (compliance/design, not exploitable)** · `lessonInsightsAI` → `toolPolicy` →
`ConceptMastery`

The chain: `lessonInsightsAI` asks a model for 3–7 concepts from the lesson body → the names are
stored as JSON → the tutor loads them as `lessonConcepts` → `toolPolicy` uses them as the write
allowlist → the canonical name is written to `ConceptMastery` → `learningPathAI` reads it and calls
the student "weak" at it.

So the *content* of a row in a student's educational record — regulated under FERPA/GDPR, and
written automatically, which S12 correctly flags as the GDPR Art. 22 case — is text an instructor
caused to exist without typing it, via a model, with no human approval step. Not an attack; the
instructor is entitled to define their course's concepts. But it is worth naming as a design
property, because the mitigation the platform relies on (the conversation ceiling) bounds the
*level*, not the *vocabulary*.

Two implementation notes on this chain:

- `lessonAI.service.ts:57-63` defensively filters non-string concept names before they reach
  `toolPolicy`, with a comment explaining that a non-string would throw inside the policy's `trim()`
  and turn a denial into an unhandled error. That defence is load-bearing and correct.
  `mergeAndExplain` reads the same JSON (`data?.concepts`) with **no** such filter, straight into
  `JSON.stringify` — harmless there, but the asymmetry means the invariant lives in one consumer
  rather than at the boundary.
- The insights cache key is `sha256(lesson.content)`, so editing a lesson regenerates concepts.
  Existing `ConceptMastery` rows keep the **old** names, which nothing reconciles — a student can
  hold mastery of a concept the lesson no longer has. Cosmetic today; it interacts with the
  cross-lesson collision already recorded in S13 §7.

**Fix.** No code change proposed. Record it in `security.md` S12 as a named property of the design,
and validate `LessonInsights.concepts` against `ConceptsSchema` at the read boundary
(`lessonInsightsRepository.findByLessonId`) rather than in one of its two consumers.

---

### C7 — quizAI feeds its own error strings back into the prompt

**Severity: Low** · `quizAI.service.ts:96-104`

```ts
} catch (error) {
  hint = error instanceof Error ? error.message : "Unknown error";
}
// next iteration:
`Generate ${n} questions for this lesson. Important correction from previous attempt: ${hint}`
```

On a validation failure `hint` is a controlled string from `validateSemantics` — fine. On a **thrown**
error it is an arbitrary exception message: an OpenAI SDK error, a Zod issue, or a Prisma message,
interpolated raw into the next user message. Provider errors sometimes echo request content, so this
is a small, unwrapped path from an error channel back into a prompt.

**Fix.** Feed only the validator's own messages back; on a thrown error retry with no hint, and log
the exception instead.

---

## Checked and clean

- **Wrapping at the other consumers.** All four tutor tools wrap what they return, including
  `get_student_progress` (lesson titles) and the sentinel-string cases which correctly stay
  unwrapped. `quizAI` wraps lesson content, existing questions, and `Course.level` — the last
  because it is `z.string()` rather than an enum, which is exactly the right reason.
  `lessonInsightsAI` wraps `{content}` once at the service and the three chains inherit it.
- **`ChatPromptTemplate` variables** are values, not templates — a lesson body containing `{}` is not
  re-parsed.
- **Rendering of structured AI output.** `StudyGuideCard` (summary, concepts, glossary),
  `LearningPathCard` (summary, weak concepts) and `QuestionCard` (question, options) all render as
  plain React text nodes. React escapes them. Only three components in the app use react-markdown at
  all.
- **Ownership on the generation paths.** `lessonInsightsAI.generateForLesson` and
  `quizAI.generateForLesson` both filter `section: { course: { instructorId } }`;
  `getForLesson` allows instructor-or-enrolled-student and nothing else.
  `courseGenerationRepository.findFirst` filters `instructorId`.
- **Raw SQL in the embedding repository.** Vectors and ids are parameterized; `LIMIT` is clamped
  through `Math.max(1, Math.min(100, Math.trunc(limit)))`; `$queryRawUnsafe`'s WHERE is assembled
  from a fixed condition list with `$n` placeholders. No injection path found.
- **courseAI blocked turns persist nothing** — the guard returns before `getOrCreateCourseGeneration`,
  so the `finally` block that saves the user message is never reached. The comment says so, and the
  control flow matches.

## Not verified

- No tests or evals were run; every claim is from reading.
- I did not attempt to construct a working injection payload against any of these hops — the
  containment arguments in C1 and C2 are structural (what code reads what state), not empirical.
- Whether a student can enrol in an unpublished course was not traced end to end; C5's "no exposure
  follows today" depends on it.
- `resources[].url` rendering was read in `CourseLearnView` only; other surfaces may render it too.

---

## Suggested order of work

| # | Finding | Effort | Why |
|---|---|---|---|
| 1 | **C1** pin the courseAI invariant | ~1 h | Cheapest possible prevention of a future cross-tenant Critical; a comment and one contract assertion |
| 2 | **C4** stop shipping the answer key | ~3 h | Closes S13 §11 *and* repairs the level-3 integrity claim in S7 |
| 3 | **C2** wrap `weakConcepts` | ~15 min | One line; then the completeness lint as a follow-up |
| 4 | **C3** shared `urlTransform` + URL validation | ~3 h | Aligns the rest of the app with the standard the tutor already meets |
| 5 | **C5** length caps + Rule 7 checklist | ~2 h | Cost control at the true entry point |
| 6 | **C7** hint hygiene | ~30 min | Small, obvious |
| 7 | **C6** record the property, validate at the boundary | ~1 h | Documentation plus one schema parse |

**The one structural change worth more than any single fix** is the completeness check proposed in
C2. C1, C2 and C3 are the same defect wearing three costumes — a boundary that exists somewhere and
is missing here — and all three are invisible to a test suite that asks "did this module import the
guard?" rather than "is this field wrapped?". The `llm-security-auditor` agent added in
`.claude/agents/` encodes this as a manual check; a lint would make it free.