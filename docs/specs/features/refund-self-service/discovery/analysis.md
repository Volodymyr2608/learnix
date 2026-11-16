# Refund — Analysis

*Translated from the Ukrainian working original on 2026-11-16; content unchanged.*

← [Spec](../spec.md) · Previous stage: [Discovery](discovery.md)

The goal of this stage is to check whether the decisions gathered in Discovery hold together: contradictions, missing
requirements, ambiguities, edge cases, failure scenarios, security / consistency risks. I don't invent
behavior; I only surface situations and decide which of them are real requirements.

| Part | What | Status |
|---|---|---|
| 1 | The SDD guide's seven scenarios applied to Learnix decisions | Done (S6c → part 2; new ambiguity A9) |
| 2 | Contradictions between decisions | Done (C1–C5) |
| 3 | Ambiguities from Discovery assigned to Analysis: A2, A4, A5 | Done (A4, A5 — with open sub-questions) |
| 4 | The SDD guide's prompt to AI and comparison with my analysis | Done |

## A2 — what the system can count as progress

*2026-11-08. The analysis of the code and dev DB was done by AI at my request; the decision "count by number of lessons"
is mine (see [AI log](ai-decision-log.md), entry 2026-11-08 "A2").*

**Decision (PO):** progress for the Q13 threshold is counted **by the number of completed lessons in the course**, not by
duration.

### Facts

| # | Fact | Source |
|---|---|---|
| F1 | **`CourseProgress` is dead:** nothing in the code writes to it, the dev DB has 0 rows. The reference to it in Q13 was wrong (fixed) | `prisma/schema/course.prisma:52`; `grep courseProgress` → only same-named types; `select count(*) from course_progress` = 0 |
| F2 | The source of truth is `LessonProgress.isCompleted` (one row per lesson × student). `Enrollment.progress` is a cached percentage, updated **asynchronously** (fire-and-forget) after `markComplete` | `prisma/schema/lesson.prisma:31`; `server/services/lesson/lesson.service.ts:190`, `:203-245` |
| F3 | Formula: `round(completed / total × 100)`, both counting only non-deleted lessons of the course. Duration is not used | `lesson.service.ts:215-221`; `server/repositories/lessonProgress.repository.ts` `countCompleted` |
| F4 | "Completed lesson" = **the student clicked the button**. Watching the video / time on page is not checked; the only check is that the enrollment is not `cancelled` | `app/_components/Course/components/CourseLearnView/index.tsx:198` → `server/api/routers/lesson.ts:46` → `lesson.service.ts:176`, `:121-124` |
| F5 | `markIncomplete` **does not recompute** `Enrollment.progress`: the count in `LessonProgress` drops, the cache stays stale — the sources diverge | `lesson.service.ts:276-284` (no call to `syncProgressAndFireEvents`) |
| F6 | The denominator moves with the course: the instructor adds lessons — the student's percentage drops; removes them — it rises. Progress is relative to the current course, not the course at the time of purchase | `lesson.service.ts:215` |
| F7 | Certificate = `Enrollment.completedAt`: set once at 100%, never cleared (neither by `markIncomplete` nor by new lessons) | `lesson.service.ts:231` (`completedAt ?? new Date()`); `server/services/certificates/certificate.service.ts:15` |
| F8 | `durationMinutes` is filled in **all 145** non-deleted lessons in the dev DB (null: 0) | query against `lessons`, 2026-11-08 |

**What the system cannot do:** know whether the student actually watched the video / read the lesson. The "watched
videos" option from A2 needs new work (view tracking) — beyond current capabilities.

### Conclusions for Refund

1. **Risk of bypassing Q12 (the main one).** A student can go through the whole course without clicking "Complete" —
   progress 0%, the request passes. The threshold measures what the student **marked**, not what they **consumed** (F4).
   Duration doesn't protect against this either. → **Alternatives:** accept as a known limitation or look for
   mitigation.
2. **New open question: where to take progress from for the request.** Live from `LessonProgress` — the student
   unchecks lessons and drops below the threshold (F5). From `Enrollment.progress` — the value may be
   stale (F2, F5). → **Specification / Decision.**
3. **The "certificate not obtained" condition is reliable:** `completedAt != null` is a stable signal (F7).
4. **Edge case:** the instructor adds lessons after purchase, the student's progress drops below the threshold (F6).
   → scenarios table (part 1).

### Rationale for "by count"

The argument "duration is not filled in" **doesn't hold** — the data is there (F8). The decision rests on something else:
- the certificate already requires 100% of lessons — a threshold in the same units is consistent with it (F7);
- the formula already exists and is in use (F3);
- duration doesn't protect better against the main risk (conclusion 1) — the options are equal here.

*TODO (me): verify each fact F1–F8 against its references and restate the rationale in my own words.*

## A4 — what "refund" means in the product

*2026-11-08. The inventory and code check were done by AI at my request; decisions D1–D4 are mine
(see [AI log](ai-decision-log.md), entry 2026-11-08 "A4").*

**What refund does now.** `handleRefund` (`server/services/payments/payment.service.ts:167-195`)
does only three things: payment → `refunded`, enrollment → `cancelled`, reversal of the transfer. Everything else
depends on whether each individual service checks `status ≠ cancelled` itself.

### Artifact inventory

| # | Artifact | What happens now after refund | Source |
|---|---|---|---|
| I1 | Lesson access | Closed | `server/services/lesson/lesson.service.ts:121-124` |
| I2 | Quizzes, concept checks | New attempts blocked; old results remain | `quiz.service.ts:195`; `conceptCheck.service.ts:140` |
| I3 | `LessonProgress`, `QuizAttempt`, AI tutor conversations, `ConceptMastery` | Data remains, just inaccessible | nothing is deleted |
| I4 | Certificate | Remains (Q7). Unreachable via Learnix (Q12) — only on manual refund (A5) | `certificates/certificate.service.ts:15` |
| I5 | Review and rating | The review remains and **counts toward the rating** of the course and instructor. A review can only be left from `completed`, so this too is only the A5 path | `review.service.ts:23`; `courseReview.repository.ts:43` (no enrollment filter) |
| I6 | **Messages to the instructor** | A new conversation can't be started, but **in an existing one the student keeps writing** (and this sends email). `send()` checks only conversation membership, not enrollment | `messaging/messaging.service.ts:48-52` vs `:119-123`, `:141-151` |
| I7 | Invoice | Remains with status `refunded` (Q22) | `billing.listPurchases` |
| I8 | Interest embedding / recommendations | Not recomputed after refund — the refunded course affects recommendations | `enrollment.service.ts:79` calls `recomputeUserInterest`; `handleRefund` does not |
| I9 | Instructor statistics | Student count filters out `cancelled`; revenue shows `refunded` | `enrollment.repository.ts:70,170,253` |

### Repeat purchase

Buying again is possible: `payment.service.ts:58-63` blocks only `active`/`completed`; `enrollInCourse`
moves `cancelled → active` and clears `completedAt` (`enrollment.service.ts:73-78`).

- **R1. Progress "resurrects".** `LessonProgress` is not deleted, `Enrollment.progress` is not reset:
  the student sees the old percentage, and after the first "Complete" — old + new (A2 F2, F3).
- **R2. The certificate comes back.** `completedAt = null`, but if it was 100% before the refund, the first click
  on any lesson grants the certificate again.
- **R3. The number of refunds is unlimited.** The cycle "bought → went through without "Complete" (A2) → refund →
  bought again" is not limited by anything — it amplifies the risk of bypassing Q12.

### Decision (PO)

| # | Question | Decision | Why (my words) | Open |
|---|---|---|---|---|
| D1 | Can the student write to the instructor after a refund (I6)? | **No**, communication about this course is forbidden | The course didn't suit the student, and so neither did the instructor and their style | Block only the student or the conversation in both directions? History — read-only or hidden? (Specification) *(decided 2026-11-16: both directions, history read-only, [decisions §D1](decisions.md))*. The channel about the refund itself is the admin via the request (Q21) |
| D2 | What does a repeat purchase do with old progress (R1, R2)? | **Start from zero**, clean up the leftover data | The student may never return to the course | **When to clean up — Open (Alternatives):** deletion at refund is irreversible and destroys the evidence for the admin's decision (Q19) and statistics data (`getCompletedMinutesTotals`); the alternative is to reset at repeat purchase |
| D3 | How many refunds for the same course (R3)? | **One**, then we block | — | What do we block: the second request (purchase allowed, no guarantee — then a warning at checkout) or the purchase itself? Does a manual refund via Stripe (A5) count? |
| D4 | Recompute recommendations after refund (I8)? | **Yes** | — | — |

**Link to A5:** I4 and I5 arise only through a manual refund in the Stripe Dashboard. If A5 = "Learnix
only", they disappear; otherwise we need to decide whether to revoke the certificate and review.

*TODO (me): verify I1–I9, R1–R3 against references; write the "why" for D3, D4.*

## A5 — does the manual path via the Stripe Dashboard remain

*2026-11-08. Facts M1–M5 were gathered by AI; decisions E1–E4 are mine (see [AI log](ai-decision-log.md),
entry 2026-11-08 "A5").*

### Facts

| # | Fact | Source |
|---|---|---|
| M1 | Learnix **never initiates a refund itself** — there is no `refunds.create` in the code. Right now the Dashboard is the only path | `grep refunds.create` → 0 |
| M2 | The `charge.refunded` webhook handles **any** refund (Dashboard or API), it does not distinguish the source | `app/api/stripe/webhook/route.ts:55-64` |
| M3 | `handleRefund` doesn't look at the amount. `charge.refunded` also arrives for a **partial** refund → payment `refunded`, access closed. Contradicts Q16 | `server/services/payments/payment.service.ts:167-195` |
| M4 | Dispute / chargeback **is not handled**: there are no `charge.dispute.*` events in the webhook | `route.ts` (switch) |
| M5 | Redelivery of the same event is safe — deduplication by `event.id` | `route.ts:44` |

**The key point:** "only via Learnix" can't be guaranteed technically — anyone with Dashboard access can
click Refund, and the webhook will arrive all the same. So A5 actually asks: *what does the system do with a refund
without a request?*

### Decision (PO)

| # | Question | Decision | Open |
|---|---|---|---|
| E1 | Manual refund via Dashboard — allowed? | **Yes, as an emergency path.** The main one is refund from the platform: the admin reviews the request and returns the money right there (consistent with Q21) | Whether two paths are optimal — investigate at Alternatives (together with A1) |
| E2 | Consequences of a refund without a request | **The same** as for a request (D1–D4), and it **counts as the one allowed refund** (D3) *(changed 2026-11-16: does not count, [decisions §OQ-3](decisions.md))*. The certificate **is revoked**; the review — TBD *(decided 2026-11-16: hidden, replaced on a new review, [decisions §E2-R](decisions.md))* | There is **no** mechanism to revoke a certificate (certificate = `completedAt`, A2 F7) — a new capability, approach at Alternatives. The review has soft-delete (`deletedAt`), the rating will filter it out (`courseReview.repository.ts:43`) — cheap to remove |
| E3 | Partial refund in the Dashboard (M3) | **TBD** *(decided 2026-11-16: (c), [decisions §OQ-7a](decisions.md))*. Options: (a) ignore — access remains, payment partially refunded; (b) treat as full — as now; (c) don't change access and notify the admin | Specification |
| E4 | Dispute / chargeback (M4) | **A separate task, out of Refund's scope** | Record in the spec as a non-goal with accepted risk: chargeback after the window — the instructor has already received the money, the platform bears the loss (Q9, Q25); the student's access is not closed |

### New requirement following from E1

When Learnix initiates the refund (`refunds.create`), Stripe still sends `charge.refunded` — one
refund arrives **twice**: the admin action + the webhook. The system must link the webhook to the request
so it doesn't apply the consequences twice and doesn't count it as a second refund (D3). → part 1,
the "repeat request" scenario.

*TODO (me): verify M1–M5 against references; explain in my own words why "Learnix only" can't be
guaranteed technically.*

## Part 1 — scenarios

*2026-11-08. Mapping the SDD guide's scenarios onto Learnix and the facts — AI; decisions — mine (see
[AI log](ai-decision-log.md), entry 2026-11-08 "Scenarios").*

**Additional facts**

| # | Fact | Source |
|---|---|---|
| R4 | `handleRefund` runs without a transaction. Reversal fails → payment already `refunded`, webhook returns 500, Stripe retries. The retry is idempotent; if reversal keeps failing — Stripe stops (~3 days), leaving `refunded` + `transferred` | `server/services/payments/payment.service.ts:167-195`; `connect.service.ts:195-207` |
| R5 | No request entity and no intermediate status: `PaymentStatus` = `pending \| succeeded \| failed \| refunded` | `prisma/schema/payments.prisma` |

### Scenarios and decisions

| # | Scenario | What it looks like in Learnix | Decision (PO) | Open |
|---|---|---|---|---|
| S1 | Full refund | Full amount + consequences D1–D4 | Closed by Q16, A4 | — |
| S2 | Partial refund | Only via Dashboard; currently handled as full (M3) | E3 (TBD) | Specification |
| S3 | Repeat request | (a) a second request while the first is under review; (b) the admin clicks "Approve" twice; (c) admin action + webhook (E1); (d) repeated webhook — safe (M5) | **(a)** while a request is under review, the button is disabled with an explanation. After rejection — a notification, the button is available again. **The request is a form with a reason and evidence files**; the admin decides based on the evidence | Limit on the number of requests (D3 limits only successful refunds). (b), (c) — Specification. **New ambiguity A9** (below). Files are a new attack surface → `security-auditor` at `/spec` |
| S4 | Provider error | (a) `refunds.create` failed; (b) refund created but later `failed` (*per Stripe docs — verify*); (c) reversal failed (R4) | The system **retries automatically** after some time; the admin panel has a **manual trigger** for the retry | Interval and number of attempts; what to do with an error a retry won't fix (e.g. closed card) — final status |
| S5 | Slow API response | Refund created, money on the card after a few days | The student sees the request statuses; **no separate "waiting for Stripe" status is needed** | List of statuses — Specification |
| S6 | Concurrent requests | (a) two admins approve the same request; (b) the student goes through lessons while the request waits (Q19); (c) the window closes, held money goes to the instructor (Q18), and at the same time the admin approves the refund; (d) the student unchecks "Complete" to drop below the threshold (A2 F5) | **(b)** Q19 applies: the student keeps going through lessons, the admin evaluates progress at the moment of decision; if the certificate has been obtained — the request is rejected. *(Freezing the course was considered and rejected 2026-11-08: it expands scope; the student paid and has the right to learn during review; if they finish the course, no refund is needed — everyone wins.)* **(d)** "Complete" is an **irreversible** action | (c) **closed in part 2 (C1).** (a) — Specification. An irreversible "Complete" changes an existing feature (`markIncomplete` exists in `CourseLearnView`) — part of Refund or a separate change? |
| S7 | Webhook didn't arrive | Only the webhook changes the status; without it the money is refunded, access is open, payment `succeeded`. Stripe retries ~3 days | **Periodic reconciliation with Stripe** — TBD | Alternatives |

**Q19 remains in force:** freezing the course (S6b) was considered and rejected 2026-11-08, so progress
can change during review, and admin review speed remains a requirement.

### New ambiguity

| # | Ambiguity | Possible interpretations | Where I close it |
|---|---|---|---|
| A9 | The role of evidence in the admin's decision (S3). Q12 are objective conditions; evidence is subjective | Evidence only informs, the decision follows Q12 · the admin can reject when Q12 is met because of weak evidence · strong evidence can outweigh the Q12 threshold | **Closed 2026-11-08:** model (b) — [C5](#c5--objective-q12-conditions-vs-subjective-evidence-q12--a9) |

## Part 2 — contradictions

*2026-11-08. Decision pairs and the breakdown — AI; decisions — mine (see [AI log](ai-decision-log.md),
entry 2026-11-08 "Contradictions").*

### C1 — request filed within the window, decision after it closes (Q14 ↔ Q18 ↔ Q19, S6c)

**Situation.** Purchase on the 1st, 30-day window. Request on day 29, admin decision on day 32. On
day 31 the window closed, and the instructor's held share could have gone to them.

| # | Question | Decision (PO) | Consequence |
|---|---|---|---|
| C1.1 | What counts for "within the window" (Q12) | **The moment the request is filed** | Review delay does not turn against the student |
| C1.2 | Held money while the request is under review and the window has closed | **Held until the admin's decision** | Q18 refined: hold until the window closes **or** until the decision on a request filed within the window. **Requirement:** the payout to the instructor checks that there is no active request. Slow review delays the instructor's money — review speed becomes a requirement a second time (after Q19) |
| C1.3 | Who bears the loss if the refund happened after the payout | **The platform** | AI clarification: under C1.2 this is impossible via a request — the loss is only the Stripe fee (Q17). A refund after payout is possible only via the Dashboard after the window (E1) or a failure: then reversal; if the instructor has withdrawn the money — the platform covers the negative balance (Q9, Q25) → loss = **instructor's share + fee** |

### C2 — refund within the window while the instructor's money is held (Q18 ↔ E1, bug Q8)

**The chain now:**
1. Purchase; instructor payouts not set up → `transferStatus = pending`
   (`server/services/payments/connect.service.ts:118-165`, Q5).
2. Refund: `handleRefund` sets `status = refunded`, reversal only for `transferred`
   (`payment.service.ts:192`); `pending` stays.
3. The instructor connects payouts → `account.updated` → `sweepPendingTransfers` takes **all**
   `pending` without checking `payment.status` (`connect.service.ts:168-170`) → payout for a refunded
   sale.

**Why this is a contradiction:** `TransferStatus` has no "cancelled" state (`none | pending | transferred
| reversed`). The hold (Q18) makes **every** sale `pending` until the end of the window → Q8 becomes not a
rare case but the main scenario of every refund within the window.

**Decision (PO; option (c) and the atomicity requirement were proposed by AI at my request):** protection in both
places.

| # | Requirement | What it closes |
|---|---|---|
| C2.1 | **On refund** the held transfer is cancelled (a new `TransferStatus` state, e.g. `cancelled`). The instructor's share is still on the platform balance — nothing needs to be taken from them, no reversal needed | Refund before payout |
| C2.2 | **Before payout — a local check:** `payment.status ≠ refunded` | The usual case, cheap |
| C2.3 | **Before payout — a check in Stripe:** the current state of the charge (refunded? dispute?) | Webhook late / lost (S7) — the dangerous direction "pay out for something refunded". Cost — one API call per payout. Does not replace the S7 reconciliation: it doesn't close the student's access |
| C2.4 | **The transfer state transition is atomic:** from `pending` — only into one state (`cancelled` or "paying out"), whoever is first wins. Mechanism — Alternatives | Refund and payout at the same time |

**Is Q8 closed:** yes — refund before payout (C2.1), late webhook (C2.3), concurrency (C2.4).
A refund **after** payout is not Q8; the existing reversal covers it (C1.3).

### C3 — the admin bypasses Q12 (certificate) via an emergency refund (Q12 ↔ E2)

**Contradiction.** Q12: certificate obtained → refund impossible. E1/E2: the Dashboard is an emergency
path, a refund without a request has the same consequences + the certificate is revoked. Forbidding refund in the
Dashboard is technically impossible (A5, M2). So Q12 is mandatory for the student but not for the admin —
a deliberate exception or a hole? **Fact:** on a refund via the Dashboard Learnix doesn't know the reason — the webhook
carries only the amount and identifiers.

Legitimate exceptions (AI's examples, not decisions): a technical error (double charge, wrong
price); the course was removed from the platform; a legal requirement (Q24); a chargeback that is cheaper to close with a refund.

**Decision (PO):**

| # | Decision | Open |
|---|---|---|
| C3.1 | The admin **can** deliberately violate Q12 — **only via the Learnix admin panel with a mandatory reason**; the system keeps a record (audit) | Which action is this: approve a request despite unmet Q12, or initiate a refund without a request (double charge — the student filed nothing)? Does the exception count as "the one refund" (D3) if the platform is at fault? — Specification |
| C3.2 | Refund via the Dashboard (no reason) → E2 consequences **+ a notification to the admin and an admin-panel record flagged "needs review"** | Who reviews: in a pet project there is one admin — this is more of an audit log than a control |

Clarification to E1: the Dashboard remains the emergency path, but **an exception to Q12 — only via the admin panel**.

### C4 — one refund (D3) vs unlimited repeat requests (S3)

**Contradiction.** D3 limits only successful refunds; S3 allows a new request after every
rejection with no limit. Consequences: file until approved; every request is a manual review with
files; every active request delays the instructor's money (C1.2).

**Decision (PO):**

| # | Decision | Why (my words) |
|---|---|---|
| C4.1 | **At most 2 requests** per course | The first — the student may explain or provide something wrong; the second is final, they supplement their answer. The number is minimal so there's no abuse and everything is resolved quickly: 5 attempts = a long back-and-forth, 5 different pieces of evidence, 5 different reasons |
| C4.2 | A repeat request — **only within the window** | Review doesn't stretch out over time |
| C4.3 | The admin **sees the history** of previous requests | — |
| C4.4 | That the evidence must be different — **we don't control**. The platform provides only a form: **reason choice + file + short note**. The student understands themselves: the more convincing the evidence, the better the chance | Controlling the novelty of evidence is impossible; responsibility for persuasiveness is on the student |

**Open:**
- *Consequence of C4.2 + C1.1:* request on day 29, rejection on day 32 → window closed, no second
  attempt. A late request is effectively the only one — accept deliberately (incentive to file earlier) or give
  a few days for a second attempt after rejection? — Specification.
- List of reasons in the form (base — Q1: too easy / too hard / empty; is
  "other" needed?) — Specification.

### C5 — objective Q12 conditions vs subjective evidence (Q12 ↔ A9)

**Contradiction.** Q12 is three verifiable conditions (window, progress threshold, certificate). S3/C4 — the admin
decides based on evidence (reason + file + note). Models: (a) Q12 decides, evidence only
informs; (b) Q12 is an automatic filter, evidence is the admin's decision; (c) strong evidence can
outweigh Q12.

**Decision (PO):**

| # | Decision | Why |
|---|---|---|
| C5.1 | **Model (b):** Q12 not met → the system rejects automatically; met → the admin decides based on evidence | The admin spends time only on requests that passed the filter; an exception beyond Q12 is a separate path (C3.1), the line between rule and exception is clear |
| C5.2 | On rejection the admin **must write a reason**: clearly what's wrong, their own arguments if needed; can **attach file(s)** | The student must know what was missing in order to supplement the second request (C4) |

**C5.3 — open:**
- Auto-rejection by Q12: better not to allow filing (button disabled with an explanation, as in S3) than to
  accept and reject — otherwise there's the question of whether auto-rejection "eats" one of the two attempts (C4.1). — Specification.
- Files from the admin are a second upload surface (admin → student) → `security-auditor` at `/spec`.

Closes A9.

## Part 4 — comparison with AI without code

*2026-11-08. An AI agent without the code, repo, or conversation received Problem + Q1–Q25 + A1–A8 in their state **before**
Analysis and the SDD guide's prompt. The response verbatim: [`ai-raw/analysis-review.md`](ai-raw/analysis-review.md).
The comparison was made by the AI mentor (it sees the code and all of our analysis) at my request. So this is not "me vs AI" but
"analysis with code and context vs analysis from the document alone".*

**Summary:** 51 agent findings → **24 matches**, **14 partial** (the topic is in ours, but the agent
formulated it more broadly or precisely), **11 new**, **2 agent errors**. The agent's top 5 questions: 2 closed
fully, 3 partially.

### Matches (topic already closed in ours)

| Agent | Ours | | Agent | Ours |
|---|---|---|---|---|
| S1 | C1 | | E1 | C1 |
| S3 | C2 (C2.2–C2.3 — exactly "no transfer for refunded") | | E4 | M3, E3 |
| S4 | E2, C3 | | E5 | A4 R1–R2, D2 (but see errors) |
| S6 | C5 (model b) | | E6 | A2 F6 |
| V1 | S3, C4, C5.2 | | E8 | E4 (non-goal) |
| V3 | S6b (freeze rejected) | | F1, F2 | S4 |
| V4 | C4.4 | | F3 | S7, M5, C2.3 |
| V8 | E2, C3.2 | | F4 | C2.4 |
| V11 | D3, C4 | | R2 | A2, conclusion 1 (ours has the mechanism: button, `markIncomplete`) |
| N1 | A2 F7 (`completedAt`) | | R3 | D3, C4 |
| N3 | C1.2 | | R5 | S3 (b, c) |
| N8 | E4 | | — | — |

### Partial (we have it, the agent goes broader)

| Agent | What we have | What the agent adds |
|---|---|---|
| V2 SLA | "review speed is a requirement" (Q19, C1.2) | **There is no number.** Without it Q19 and C1.2 are unverifiable |
| V6 audit | Audit only for the exception (C3.1); D2 — "evidence for the admin's decision" | **A snapshot of the Q12 conditions at the moment of decision** for every request |
| V7 notifications | To the student on rejection (S3), to the admin on a Dashboard refund (C3.2) | Full matrix: who, about what, via which channel; to the admin — about a new request |
| N5 moment of check | Window — at the moment of filing (C1.1); progress/certificate — at the moment of decision (Q19) | Explicitly: **two different points in time for the Q12 conditions**. Plus C5.1 (auto-filter at filing) — is progress checked both at filing and at decision? |
| N6 statuses | Deferred (S5) | — |
| N7 "preliminary" decisions | Q10, Q18 still "preliminary" | After Analysis C1, C2 already rely on them — need to confirm or revisit |
| E3 Dashboard with an open request | Double event from a platform refund (E1 requirement) | A refund from the Dashboard while the request is still "under review" — the request must find out about it |
| E10 Stripe limit on an old payment | Criterion in Q14, not investigated | Reminded that this constrains the window + SLA |
| R4 source of truth | S7, C2.3 | An explicit decision: what is the source of truth for the fact of a refund |
| R6 PII in the reason | Files → security-auditor (S3, C5.3) | Free text too: who sees it (the instructor? Q23), moderation |
| R7 admin accountability | C3.1 | Immutable decision history |
| R8 `/pricing` | Q20 Open | Is updating the text part of the same release? |
| S2 / F5 / E8 | see "new" | — |

### New (found only by the agent)

| Agent | Finding | Assessment |
|---|---|---|
| **S2** | **Transition period:** Q15 applies the new rules to old purchases, but Q18 doesn't act on them — their shares are already `transferred`. For them, within the window, reversal and the Q9 risk remain | **Real, important.** We analyzed C1–C2 only for new purchases |
| **N4** | **Empty course and few lessons:** in a course with 3 lessons the first lesson = 33% — a percentage threshold may block exactly the "empty course", the most legitimate reason (Q1) | **Real, strong.** Hits the A2 "by count" decision directly → Alternatives (Q13) |
| **E8 (part)** | Dispute **and** refund on the same payment → the platform returns the money twice | *(decided 2026-11-16: V1, [decisions §OQ-7b](decisions.md))* **Real.** E4 puts disputes out of scope, but "don't refund twice" is already Refund. C2.3 checks dispute only before payout, not before refund |
| **E7** | The instructor disconnected Stripe / lost `payouts_enabled` during the hold | Real → Specification |
| **F6** | The admin is unavailable: under C1.2 the instructor's money is held **without a limit** | Real; related to V2 (SLA) |
| **F7** | `losses.payments` was verified only in the sandbox (Q25) — verify the production account before launch | Real, cheap |
| **V5** | The student withdraws the request — does it count as one of the two attempts (C4.1)? | Real → Specification |
| **V10** | Success metrics (Q11 without a baseline) | Real → Specification (Success metrics) |
| **N2** | What exactly starts the window countdown (payment creation or success), day boundary, time zone | Real → Specification |
| **R1** | Request authorization (IDOR): only one's own purchase, only the admin approves | Real; ours is closed by process (`security-auditor` at `/spec`), but not recorded in Analysis |
| **R9** | Accounting for held funds: on the platform balance they're easy to confuse with revenue | Real; A6 covers only the instructor side |
| **E2** | Between approval and webhook the student still has access and can complete the course | Weak: for a refund from the platform the window is seconds |
| **S5** | Problem says "the student can't get a refund **on their own**", but the flow is "asked and waits" | **Fair:** the wording in §1 ("If we do nothing") needs fixing |
| **E9** | The student deleted their account with an open request | Real, rare; account deletion exists (`server/better-auth/accountDeletion.hooks.ts`) → Specification |
| **V9** | Discounts / coupons | **Almost removed by the code:** there are no coupons; `lib/course/discount.ts` is only a display of the old price; the student pays exactly the price (Q17) → "full" = the amount paid |

### Agent errors (due to lack of code)

| Agent | What it claims | What actually happens |
|---|---|---|
| E5 | `completedAt` isn't cleared, so on a repeat purchase the old certificate will block a new request | On a repeat purchase `completedAt` **is cleared** (`server/services/enrollment/enrollment.service.ts:73-78`). The problem is the opposite — progress "resurrects" (A4 R1–R2) |
| E4 | Asks how the system behaves on a partial refund | Not an error, but the answer is already in the code: handled as full (M3) |

### What only we found (the agent missed)

| Ours | Why it missed |
|---|---|
| A2 F1 (`CourseProgress` is dead), F4 ("Complete" = button), F5 (`markIncomplete` doesn't update the cache) | Needs the code |
| A4 I6 (refunded student writes to the instructor), I5 (review in the rating), I8 (recommendations) | Needs the code |
| A4 R1–R2 (progress "resurrects" on repeat purchase) | Needs the code — and the agent reached the opposite conclusion (E5) |
| A5 M3 (partial refund already handled as full), R4 (refund without a transaction) | Needs the code |
| C2: Q18 makes Q8 the **main** scenario (every sale `pending`) | The agent came close (S3), but didn't see the scale |
| E1 requirement: a refund from the platform also produces a webhook | Stripe knowledge + code (M2) |
| C1.3: the difference in losses "via a request" vs "via the Dashboard after payout" | Requires Q25 + C1.2 together |

**Conclusion.** Without code the agent is good at finding **logical** gaps in the text (S2, N4, E8, F6, F7) —
some of them didn't occur to us, because we were looking at the code, not at the transition period and small
courses. With code we find **factual** problems (F1–F8, I6, R1–R2, M3) that the agent couldn't
find, and in one place (E5) it reached a wrong conclusion precisely because it lacked the code. Both passes
are needed: the document shows holes in the logic, the code — holes in reality.

### What carries forward

- **Alternatives:** N4 (threshold for short courses — revisit Q13/A2), S2 (transition period for old purchases).
- **Specification:** V2 (SLA — a number), V5, V6 (snapshot of conditions), V7 (notification matrix), V10, N2, N5, E7, E8 (don't refund twice on dispute), E9, F6, R1, R6, R9.
- **Discovery §1:** fix the wording "the student can't get a refund on their own" (S5).
- **Before launch:** F7 — verify `losses.payments` on the production account.
