# AI defence strategy — how five surfaces defend each other

**Status:** living document · **Last reviewed:** 2026-08-28 ·
**Scope:** `courseAI`, `lessonInsightsAI`, `lessonAI` (tutor), `quizAI`, `learningPathAI` — as one
system

This document answers the question no single feature's `spec.md` can: **what happens to feature B
when feature A's content is hostile?** Every spec defends its own surface. The seam between them
belongs to nobody, and the seam is where the interesting breaks live.

The per-surface state of every layer is machine-readable in
[`aiSurfaces.ts`](../../server/services/_shared/conformance/aiSurfaces.ts) and asserted by its
contract test — that file is the source of truth for *what is applied where*, and this document is
the source of truth for *why the shape is what it is*. Where the two disagree, the matrix is right
and this document is stale. The findings that produced the shape are in
[`findings-register.md`](./findings-register.md); the tutor's own threat model is in
[`ai-tutor-guardrails/security.md`](../specs/features/ai-tutor-guardrails/security.md).

---

## 1. One idea

**Every write surface in this system is unguarded, and that is correct.**

An instructor writing a lesson is not attacking anyone: it is their course. An injection guard on the
lesson editor would block a legitimate lesson *about* prompt injection at the moment of writing — and
this platform may well host exactly that course.

So the defence sits entirely on the **read** side. The consequence is worth stating plainly:

> The trust boundary is not where text is written. It is where text is **read into a model**. Every
> consumer must therefore be correct on its own and forever — including consumers that do not exist
> yet.

That single decision explains most of what follows. It is why `wrapUntrustedContent` is called in
five services rather than one; why a new AI surface is unsafe by default; and why the most valuable
test in the codebase is the one that asks *"is this field wrapped?"* rather than *"does this module
import the guard?"*.

## 2. Nine layers, in the order a request crosses them

| | Layer | The question it answers |
|---|---|---|
| **L0** | Authorization | may this user reach this content *right now*? |
| **L1** | Deterministic input guard | does this free text match a known attack pattern? |
| **L2** | LLM relevance guard | is this free text about the course at all? |
| **L3** | Untrusted-content wrapping | is stored text marked as *data* rather than instructions? |
| **L4** | Authority boundary | what can the model **cause**, regardless of what it says? |
| **L5** | Output boundary | did the reply leak, echo, dump or exfiltrate? |
| **L6** | Render boundary | what will the browser **do** with this text? |
| **L7** | Resource boundary | how much can one user spend? |
| **L8** | Detection | did we find out? |

**Rank matters more than the list.** L4, L5 and L6 are enforcement: they hold whether or not the
model cooperates. L1, L2 and L3 are filters: they reduce how often the model is asked to misbehave,
and they are measurably imperfect. The platform's own number — `aiGuard:indirect` — is that wrapping
untrusted data flips **1 payload in 12**, measured 2026-08-09 over the twelve rows that corpus held
then; it holds 16 rows today. L3 is mitigation, never a boundary.

Wherever this document says a defence "holds", it means an L4/L5/L6 control. Where it says "reduces",
it means L1/L2/L3.

## 3. What each surface can cause

The layer status per surface lives in the conformance matrix. What the matrix cannot say is the part
that matters here: **what a compromised surface would be able to do.**

| Surface | Fed by | What it can cause |
|---|---|---|
| `courseAI` | instructor free chat, plus **other instructors' course titles** via `search_similar_courses` | writes a course draft. Its output becomes `lesson.content` — the root of almost every chain below |
| `lessonInsightsAI` | `lesson.content` only | its `concepts` output becomes the tutor's **write allowlist**. The most consequential output in the system — Chain B |
| `lessonAI` (tutor) | student free chat, retrieved lesson content | **writes an educational record** (`ConceptMastery`). The only student-facing surface with write authority |
| `quizAI` | `lesson.content`, `Course.level` | the quiz rows students answer — and through them, mastery level 3 |
| `learningPathAI` | database signals only (progress, attempts, mastery) | what the student is told to study next |

The tutor is the reference implementation: a closed set of four tools, an authority check in
`toolPolicy`, an output boundary in `validateReply`, `inAppUrlTransform` at the render edge, a
per-feature rate limit, and the full event vocabulary. It got there first because it is the surface
that can write.

## 4. The content graph, with who defends each edge

```
   instructor writes (UNGUARDED — deliberately)
            │
     lesson.content ─────────────────────────────────────────────┐
            │                                                     │
            ├─→ chunker → LessonChunkEmbedding                    │
            │        ├─→ retrieve_lesson_context ──┐              │
            │        └─→ search_across_course ─────┤              │
            │                                      ▼              │
            │                                  ┌───────┐          │
            │                                  │ TUTOR │→ STUDENT │
            │                                  └───────┘  [Chain A]
            │                                      │
            ├─→ lessonInsightsAI → concepts ───────┤ becomes the WRITE ALLOWLIST
            │                          │           ▼
            │                          │    ConceptMastery ──→ learningPathAI → STUDENT
            │                          │                                        [Chain B]
            │                          └─→ StudyGuideCard ──────────────────→ STUDENT
            │
            └─→ quizAI → Quiz rows → QuestionCard ───────────────────────────→ STUDENT
                                          │                                    [Chain C]
                                          └─→ mastery level 3 → learningPathAI

course.title ─→ CourseEmbedding ─→ search_similar_courses ─→ ANOTHER INSTRUCTOR
                                                                        [Chain D]
```

Four edges cross a boundary **between people** — instructor→student (A, B, C) and
instructor→instructor (D). Those chains are the whole security story.

---

## 5. Chain A — hostile lesson content reaches the tutor

An instructor embeds instructions in a lesson body; a student opens the tutor on that lesson; the
tutor retrieves the poisoned chunk.

| Step | Control | Holds? |
|---|---|---|
| Instructor writes the payload | none, by design | — |
| Chunking and embedding | none — content is indexed as written | — |
| Student opens the tutor | L0: enrollment proven, not cancelled, in the same query that acts | ✅ holds |
| Tutor retrieves a chunk | search bound to `lessonId`/`courseId` by **closure**, never by a model argument; `deletedAt` filtered | ✅ holds |
| Chunk enters the prompt | L3 `wrapUntrustedContent(…, "lesson_content")` + `UNTRUSTED_DATA_CLAUSE` | ⚠️ **reduces only — 1 in 12** |
| Model obeys the payload | L4 `toolPolicy` | ✅ holds |
| Model replies | L5 `validateReply` | ✅ holds |
| Browser renders | L6 `inAppUrlTransform` | ✅ holds |

**So what can a hostile lesson actually achieve?** It *can* make the tutor say wrong or unhelpful
things, or refuse to help. Behaviour hijacking survives every layer, and it is a **recorded, accepted
risk** (tutor S13 §4): a tutor giving bad advice from one lesson is a content-quality problem that
already belongs to the instructor, who could have written the same advice into the lesson directly.

It *cannot*:

- **Write outside the allowlist.** `mark_concept_understood` refuses a concept that does not match
  `lessonConcepts` case-insensitively, and stores the **canonical** spelling rather than the model's.
- **Exceed mastery level 2.** `CONVERSATION_MAX_LEVEL` is enforced in code, not requested in a prompt.
- **Reach another student or course.** All four tools are closure-bound, and no tool schema takes an
  id-shaped argument — pinned by `toolArguments.contract.test.ts`.
- **Leak the system prompt or dump the lesson verbatim.** `validateReply` rejects both; the reply is
  retracted and never persisted.
- **Exfiltrate through a link or an image.** `validateReply` pre-filters off-origin destinations on
  the server, and `inAppUrlTransform` enforces it on the parsed AST.

**The honest summary:** hostile content degrades the tutor's **quality** and cannot raise its
**authority**. That asymmetry is the design, and it is why L4 was built before L1 was strengthened.

**If one layer fails:**

| If this fails | What still holds |
|---|---|
| L3 wrapping | L4 + L5 + L6 — the model can be steered, but cannot write, leak or exfiltrate |
| L4 `toolPolicy` | L5 + L6, and the ceiling still ties level 3 to passing quizzes — **but a fabricated mastery row becomes writable.** The most valuable layer in the system |
| L5 `validateReply` | L6 catches exfiltration; prompt disclosure and verbatim dump would pass |
| L6 render policy | L5 already rejected the reply server-side — the two are deliberately redundant |

## 6. Chain B — an instructor's text becomes a student's record vocabulary

```
lesson.content → lessonInsightsAI (model) → concepts JSON
              → the tutor loads it as lessonConcepts
              → toolPolicy uses it as the WRITE ALLOWLIST
              → a ConceptMastery row (a durable educational record)
              → learningPathAI reads it and calls the student "weak" in that concept
```

The property to understand: the *content* of a row in a student's educational record is text the
instructor **caused without typing**, through a model, with no human confirmation step. That is not
an attack — an instructor may define their course's concepts — but it means the mechanism the
platform leans on (the conversation ceiling) bounds the **level**, not the **vocabulary**.

What defends it: the allowlist is *closed*, so a hostile lesson cannot invent a new concept name at
write time; the level ceiling is enforced in code; an empty concept list denies **all** writes
(`empty_allowlist`) — fail-closed, not fail-open; and both mastery writers canonicalise through one
function, so the same concept cannot land twice under two spellings.

**Accepted residual:** editing a lesson regenerates its concepts, but existing `ConceptMastery` rows
keep the **old** names and nothing reconciles them — a student can hold mastery of a concept the
lesson no longer teaches (tutor S13 §7).

## 7. Chain C — lesson content reaches students through quizzes

`lesson.content` → `quizAI` → `Quiz` rows → `QuestionCard`.

Defended by ownership at generation, wrapping on both tool reads, `Course.level` wrapped too (it is a
`z.string()`, not an enum), a Zod schema plus `validateSemantics` (the correct answer is among the
options, no duplicates), and questions rendered as React text nodes, so markdown and HTML do not
execute.

**The gap here was never injection — it was a broken guarantee.** `quiz.getByLesson` used to return
`correct` to any enrolled student, so "confirmation by action, not by text" was refuted by the
network tab. Closed 2026-08-28 by
[`quiz-answer-key`](../specs/features/quiz-answer-key/spec.md): the key is narrowed at the
repository, guessing is bounded by a per-window attempt cap, and the pairing is load-bearing — the
projection alone would have turned one read into a three-request enumeration.

What remains open is the other half: the key is **model-authored**, so a poisoned lesson can steer
which option is marked correct, and no layer checks that. It is declared as an exception in the
conformance matrix rather than quietly dropped.

Chain C is the clearest example of why per-feature review is not enough: the quiz finding was fairly
rated *low* within its own boundaries, and its whole severity came from a guarantee written in a
**different** feature's spec.

## 8. Chain D — the only cross-tenant edge

`search_similar_courses` returns **other instructors'** titles and subtitles into instructor B's
builder. Instructor A publishes a course with an injection in its title; instructor B's assistant
retrieves it.

It does not reach B's screen, and the containment is structural: tool results land in
`state.messages`; `chat_response` builds its reply from `state.content`, `state.history` and
`state.userMessage` and **never reads `state.messages`**; the route streams only `chat_response` and
`clarify`; and the four tools have **no network egress**.

A successful injection here can therefore influence *which tool the router calls next, and with what
arguments* — and nothing else.

The danger is that this reads like an oversight rather than a decision, and it is exactly the
oversight a future "ground your answer in the retrieved examples" improvement would *fix*. The
invariant is pinned by a contract test, and the rule is: if grounding is ever needed, it arrives
**together** with an output boundary and a render policy, in one change.

## 9. Chain E — a conversation that feeds itself

A student's own message replays as trusted `HumanMessage` history on the next turn, where L3 wrapping
does not apply. So "what did the guard reject?" is answered in the persistence plane:

| Rejection | Persisted | Returned as model context? |
|---|---|---|
| L1 block | **nothing** — a stored payload would replay unwrapped and quietly beat the block | n/a |
| L2 off-topic | both rows, so the refusal survives a reload | no |
| L5 rejection | the user turn only; the reply is retracted | no — flipped to `contextEligible: false` |

The third is the subtle one: **an output rejection is a stronger hostility signal than an input
rejection**, so leaving the prompt that caused it context-eligible would let an attacker resend the
payload with the previous attempt in context as ordinary conversation — the prompt gets retries, the
defence gets one sample per retry.

## 10. Chain F — one model's output entering another's prompt

The case that gets missed because it looks like internal plumbing rather than untrusted input:
`reflectAndCheck`'s critique feeding `mergeAndExplain`; quizAI catching a thrown error and feeding
the **exception text** into its next prompt (provider errors sometimes echo request content —
declared as an exception in the matrix); and `lessonInsightsAI`'s output becoming the tutor's
authority input (Chain B).

The rule this chain teaches:

> **A model's output becomes untrusted input the moment something reads it — including another
> model, and including itself.**

## 11. Where one failure travels furthest

Ordered by blast radius, not by likelihood:

1. **`toolPolicy`** (Chains A/B). The only thing between hostile lesson content and a fabricated
   educational record. Everything else degrades quality; this degrades integrity.
2. **`lessonInsightsAI`'s `concepts` output** (Chain B). A model output used as another feature's
   authority input. Fail-closed on an empty list, which is why it is second rather than first.
3. **`chat_response` not reading `state.messages`** (Chain D). The only cross-tenant containment,
   resting on the current shape of one function.
4. **Wrapping completeness** (all chains). Registration proves a module *imports* the wrapper; it
   proves nothing about the one field that was left bare inside it.
5. **The quiz answer key** (Chain C). Not an AI surface at all — and it falsified an AI surface's
   guarantee.

## 12. What is true today, in one paragraph

Every surface now carries wrapping, a resource limit and an output boundary; on `quizAI` and
`lessonInsightsAI` that boundary is **report-only** at a measured ~10% false-positive rate, so it
observes rather than blocks. Instructor content **can** steer any model in the system and **cannot**
— on the tutor — raise authority, leak the prompt, dump the lesson or exfiltrate through a link:
those four are enforced. The four zero-baseline security outcomes now reach a sink; the rate-based
ones still do not, so "we would find out" is true for the events whose normal rate is zero and
aspirational for the rest.

## 13. Rules for the next AI surface

Derived from the breaks above, in the order they bite:

1. **Treat your input as hostile on read, not on write.** If you read anything a user or instructor
   wrote, wrap it — including titles, enums-that-are-strings, and other models' output.
2. **Decide what the model may *cause* before deciding what it may *say*.** A closed tool set with an
   authority check is worth more than any instruction in a prompt.
3. **A prompt instruction is never a control.** Describe it as defence in depth, or delete it.
4. **Validate output before persistence; enforce URLs at render.** Server-side regexes do not keep up
   with CommonMark; the enforcement point is the render transformer.
5. **A boundary is needed on every exit, not just the happy path.** Abort, mid-stream error and a
   consumer abandoning the generator all leave tokens in the browser. `finally` is what actually
   closes it.
6. **A rejected turn must not become context.** Otherwise a retry is a free re-sample.
7. **Register the surface and declare which layers are `n/a`, and why.** Silence is how a layer goes
   missing for four features at once.