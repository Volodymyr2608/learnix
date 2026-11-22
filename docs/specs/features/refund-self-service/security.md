# Security requirements — refund self-service

This document states **requirements and accepted risks** from the `/spec` design pass, before any
code exists. It is the complex-tier sibling of [`spec.md`](spec.md) (money is in scope). Each control
below has a matching acceptance criterion `AC-C<n>` in the spec.

Source: the `security-auditor` design pass of 2026-11-16, raw output in
[`discovery/ai-raw/security-design-pass.md`](discovery/ai-raw/security-design-pass.md). The decisions
it raised are in [`discovery/decisions.md`](discovery/decisions.md) (T10, T11, T27, FR-S15).
Related ADRs: [037](../../../adr/037-refund-payout-hold-and-money-consistency.md) (amended for T6,
T7, T8, `paidAt`) and [017](../../../adr/017-owasp-security-rules.md) Rule 4 (amended for student
evidence uploads).

**No AI surface is added by this feature**, but existing AI and lesson-derived features let a
student consume lesson content without an "opened" record, which the refund threshold turns into
money. The `llm-security-auditor` design pass covered this (§AI below; raw output
[`discovery/ai-raw/llm-security-design-pass.md`](discovery/ai-raw/llm-security-design-pass.md)).

## Assets and actors

- **Assets:** the platform's Stripe balance (refunds, transfers, reversals); the instructor's held
  net; course content; student personal data (reason text, evidence files, refund history); the
  audit trail; certificate validity.
- **Actors:** a student, including a malicious one (sampler, multi-account user, racer, double
  submitter); an instructor, including one who manipulates lesson counts or wants to learn who
  refunded and why; an admin, including an absent one; anonymous callers of the job, webhook and
  file routes; Stripe; the scheduler.

## Controls

L×I = likelihood × impact.

| C | Threat | L×I | Control | FR |
|---|---|---|---|---|
| C1 | IDOR: request, appeal or status for another student's payment | M×H | The refund page and student-only endpoints take a payment id; the payment is loaded by that id and the session's student id in the one query that authorizes; every later step uses that row (amended 2026-11-21, UI-1: the refund moved from the course page to the Purchases page) | FR-S1, S5, S12 |
| C2 | The client chooses the refund amount or target | L×H | `refunds.create` with the stored payment intent and no `amount`; strict input with no money fields | FR-S6 |
| C3 | Double submit creates two requests or two refunds | H×M | Unique request and appeal per payment in the database; idempotency key per payment; `charge_already_refunded` reconciles instead of failing | FR-S7 |
| C4 | Race on the account limit: parallel requests all pass | M×M | Count and insert in one transaction under a per-student lock; no network call inside; in-progress refunds count | FR-S2 |
| C5 | Refund vs release at the window edge | L×H | The release claim is one conditional update carrying the full predicate; 1 h grace margin; reversal as the last line | FR-P2, P4 |
| C6 | Release during the appeal grace or while a refund is processing or failed | M×H | Predicate amended (ADR-037 §1) | FR-P2a |
| C7 | Transfer twice after a crash, once the idempotency key has expired (~24 h) | M×H | `transfer_group = payment.id`; list before retry, for transfers, refunds and reversals (ADR-037 §2) | FR-P4 |
| C8 | Effects applied twice by the webhook and the replay concurrently | H×M | One compare-and-set on payment status gates all effects; database effects in the same transaction (ADR-037 §4) | FR-P14, P15 |
| C9 | Reading lessons without an "opened" record (fail-open write; the tutor route) | M×M | Record written before content is returned, fail-closed, on every content path | FR-P19 |
| C11 | Overdue auto-approval as an unlimited bypass | M×M | Only appeals after an automatic denial for a condition other than the threshold or the account limit are auto-approved; the failed condition comes from the server snapshot (decision T11, amended 2026-11-21: tab race) | FR-A5 |
| C12 | Refund of a disputed charge | L×H | Live charge check before every `refunds.create`; stored dispute state from dispute events drives the button | FR-P18, P18a |
| C13 | Double-charge race: both or neither refunded; a duplicate released | L×M | Lock on the student + course enrollment; keeper = earliest paid; duplicate marked cancelled before its refund | FR-P17 |
| C14 | Old early-payout paths survive | H×H | One release function is the only caller of `transfers.create`; Sweep and the transfer at sale removed | FR-P24 |
| C15 | Job endpoint called by anyone, or a weak secret | M×H | Constant-time compare of `CRON_SECRET` (≥ 32 chars, validated in `lib/env.js`); empty 401; counts only in the response | FR-P25 |
| C16 | Overlapping job runs | M×L | Redis lock with TTL > max duration, compare-and-delete release; "Run job now" calls the service, never the URL | FR-A9 |
| C17 | Admin actions reachable by others | L×H | Admin-only procedures; reasons required where the spec says so | FR-A1, A2, A6, A8, A9 |
| C18 | Audit edited or deleted | L×M | Append-only audit table; repository without update or delete; Postgres trigger rejects UPDATE and DELETE | FR-A3 |
| C19 | The instructor learns of a request, appeal or reason | M×M | Instructor queries never select refund tables; held amounts from payment columns only; no refund data in instructor emails | FR-I2 |
| C20 | Evidence file IDOR or public exposure | M×H | Private Blob store; authorizing route; 404 to everyone but the payment's student and an admin | FR-S15 |
| C21 | Malicious or oversized file | M×M | PNG, JPEG, PDF by magic bytes; ≤ 3 files, ≤ 4 MB; served as a download with `nosniff` and a sandbox CSP | FR-S15 |
| C22 | Stored XSS through reason, appeal, denial text or file name | L×M | Rendered as text only; length caps; reminder emails carry no student text | FR-S3, S15, A2 |
| C23 | Stripe or database details leak to the student | M×L | Typed error codes for the student; raw Stripe message only on the admin's problem-payment view | FR-S20 |
| C24 | Feature flag enforced only in the UI | M×M | Server-side flag check | FR-P20 |
| C25 | Revoked certificate still served by a 30-day token | M×L | PDF and list reject revoked certificates | FR-P10 |
| C26 | Messaging not actually closed | H×L | Sending to a closed conversation is rejected in the service for both roles | FR-P11 |
| C28 | Checkout status finalizes anyone's session, now with a refund side effect | L×L | Status check bound to the session's student | FR-P26 |
| C29 | Account deletion leaves refund text and files | M×M | Anonymisation erases free text and file names and deletes files; numbers and audit kept | FR-P23 |

C10 and C27 are decisions, not controls (below).

## Accepted risks

- **Several accounts per person (T10).** The account limit is per user; each new account gets 3 more
  automatic refunds. Loss per refund: the Stripe fee and up to 3 lessons. Decision T10.
- **Course deleted by its instructor (T27).** Until the separate "no deletion of purchased courses"
  feature ships (AS-8), in-window buyers of a deleted course need admin exceptions.
- **Malware in evidence files.** Bounded by the type allowlist and download-only, sandboxed serving;
  no antivirus pipeline in a pet project.
- **Location and other metadata in student photos.** The student's own data, seen only by the admin.
- **Stolen card, buy then refund.** A refund returns to the original card; no cash-out.
- **Chargeback after release (up to 120 days).** The platform bears it (D-6); the hold reduces it.
  A dispute lost while the share is still held cancels the share and applies the refund effects
  (decision DL, FR-P18b); after release the transfer is not reversed.
- **An instructor buying their own course from another account.** Gains nothing over a normal sale.
- **"On hold past day 14 means an appeal"** for an instructor with one sale (decision A6).
- **A compromised admin refunding in bulk.** The admin is trusted by design; the audit detects it.
- **Learning-path reasons drawn from unopened lessons (AI-C6).** The learning path enriches up to 3
  next not-completed lessons, which may be unopened, with their study-guide summary; the model
  writes at most 5 sentences per regeneration, rate-limited. A small, repeatable leak, accepted
  (decision AI-C6, `discovery/ai-raw/llm-security-design-pass.md`).
- **A partial Dashboard refund disputed for the full amount.** Stripe-side, rare, the platform bears
  it (OQ-7a).

## AI controls

The rule: **gate inside the authorizing query, never let the model widen it.** A student gets lesson
content only from lessons they opened. Restricting, not recording an open, because a model-chosen
search must not spend the student's threshold (LLM06).

| C | Surface | Threat | Control | FR | AC |
|---|---|---|---|---|---|
| AI-C1 | Tutor route `app/api/chat/lesson/route.ts:25-90` | A tutor turn on an unopened lesson | Refuse unless the lesson is opened, in the authorizing query, before the guard and any model call | FR-P19a | AC-L1 |
| AI-C2 | `search_across_course` (`embedding.repository.ts:149-163`) | From one opened lesson the tutor reads the whole course: "summarise sections 3 and 4" needs no injection | Search only chunks of opened lessons; student id bound by closure | FR-P19a | AC-L2 |
| AI-C3 | Study guide (`lessonInsightsAI.service.ts:132-179`) | A whole-course study guide with zero opens | Student branch only for opened lessons | FR-P19a | AC-L3 |
| AI-C4 | Quizzes (`quiz.service.ts:185-210`) | Questions and answers of unopened lessons | `verifyEnrollment` only for opened lessons | FR-P19a | AC-L4 |
| AI-C5 | `pendingCheck`, `getHistory` | — | Covered by AI-C1 and by deletion (AI-L13) | — | — |
| AI-C7 | All | A new content reader appears later | Contract test of student-reachable readers | FR-P19a | AC-L7 |
| AI-C8 | Rollout | Gates shipped after the button leave in-window purchases with undercounted opens | Ship with the hold | FR-P20 | AC-L8 |
| AI-L9 | Refund text | Reason or appeal text quietly fed to a model later | Contract test: no AI entry point reads refund data | FR-S3 | AC-L9 |
| AI-L10 | Tutor tools | Injection asks the tutor to reset opened lessons | Contract test: no tool reaches opened or refund state | FR-P19a | AC-L10 |
| AI-L11 | Tutor answers | The tutor invents refund terms (LLM09), e.g. the old 30 days | Eval rows | — | AC-L11 |
| AI-L12 | Recommendations | The interest profile recomputed only on enroll; a refunded course recommended back | Recompute on every refund path; exclude cancelled enrollments (decision REC) | FR-P12 | AC-L12 |
| AI-L13 | Stored AI artifacts | `ConceptCheck` and `LearningPathCache` survive a refund and are served without an enrollment check | Deleted with the other learning records | FR-P9 | AC-L13 |
| AI-L14 | LangSmith traces | Traces with student messages outlive the refund deletion | Inherited: tracing off in production (`ai-tutor-guardrails/security.md`) | — | AC-L14 |

**Reopened elsewhere:** `ai-tutor-guardrails/security.md` S13 §25 ("RAG scope is the whole course")
was accepted because enrollment grants full course access. The refund threshold gives access inside
a course a price, so course-wide retrieval became a bypass of a money rule. AI-C2 closes it.

**Telemetry:** a `lesson_not_opened` refusal event on AI-C1, C3, C4 (baseline ≈ 0, since the UI
never calls them before an open; any count means direct API use); for AI-C2, a count of searches
where an unopened lesson would have ranked in the top-k (the usefulness cost). Run the tutor evals
(`pnpm eval`) before merge.

### Accepted for slice 1 only — must be closed before the student flag is turned on

Found by the `/qa` audit of slice 1 (2026-11-22). Each is unreachable while `REFUND_STUDENT_ENABLED`
is off, because the flag check runs before any database work (C24); each is a Release checklist item.

- **Lock wait holds pool connections (Medium before flag-on).** `refund.request` opens an
  interactive transaction and then waits on the per-student advisory lock (C4); the lock is taken
  before the payment is checked and there is no rate limit. One student keeping ~20 requests in
  flight can hold most of the Prisma pool; other users' queries time out (P2024) and the refund
  transactions hit the 5 s timeout, returning a generic error (nothing is written wrongly). Fix
  before flag-on: a per-user limiter before the transaction (the `checkAiRateLimit` pattern), an
  ownership pre-check outside the transaction, and a bounded wait (`SET LOCAL lock_timeout`) mapped
  to a typed "try again" error. Testable: a request blocked longer than the timeout rejects.
- **Refund free text survives account deletion (C29).** Slice 1 is the first to store
  `refund_requests.text`; `userService.anonymiseAccount` does not clear it yet (FR-P23, AC-C29).
- ~~**Access continues after an automatic approval.**~~ *Closed by slice 3:* an approved request is
  refunded at once and its effects cancel the enrollment in the same transaction as the refund's
  compare-and-set; while Stripe has not confirmed (`processing`), access stays open by design
  (FR-S20).

### Slice 2 (hold and release, 2026-11-22) — control status

| C | Status | Where |
|---|---|---|
| C5 | Implemented: one conditional update with the full predicate, 1 h margin. Remainder → slice 3: a refund committed between claim and transfer ends in one reversal | `payout.repository.ts` `claimForRelease` |
| C6 | Implemented: an `auto_approved` request (no refund yet, H2) and an `auto_denied` one inside its appeal deadline (H3) block every path | same predicate fragment |
| C7 | Implemented for transfers: `transfer_group = payment.id`, idempotency key, list before create; a pre-slice-2 transfer (no group) is found by its source charge across every page of the destination's transfers. Refunds and reversals → slice 3 | `connect.service.ts` `releasePayment`, `findLegacyTransfer` |
| C14 | Implemented: `transfers.create` only in `releasePayment` (contract test); Sweep and the transfer at sale removed | `transfers.contract.test.ts` |
| C15 | Implemented: constant-time Bearer compare, empty 401, counts only; `CRON_SECRET` ≥ 32 chars, re-checked in the route; missing secret refuses every caller | `app/api/cron/release-payouts/route.ts` |
| C16 | Implemented: Redis `SET NX PX` with a token, compare-and-delete release, 15 min TTL; per-process fallback only in development and test | `runLock.ts` |
| C28 | Implemented: the status procedure finalizes only the caller's own session | `finalizeCheckoutForStudent` |

### Slice 3 (refund effects, 2026-11-22) — control status

| C | Status | Where |
|---|---|---|
| C2 | Implemented: `refunds.create` gets exactly `{ payment_intent }` from the stored payment, plus an idempotency key; input stays strict | `refund.service.ts` `createStripeRefund` |
| C3 | Implemented: unique request per payment; one Stripe refund for concurrent requests; `charge_already_refunded` is success | `executeRefund` |
| C5 | Remainder implemented: a refund committed during a release ends in exactly one reversal | `connect.service.ts` `recordTransfer` |
| C7 | Implemented for refunds (`refunds.list` before create) and reversals (`listReversals` before `createReversal`, key `reversal:<payment>`) | `executeRefund`, `reverseTransfer` |
| C8 | Implemented: one `succeeded → refunded` compare-and-set gates every effect; database effects in the same transaction; webhook + replay race tested | `refundEffects.repository.ts` `claimRefund` |
| C12 | Partly: no `refunds.create` on a disputed charge (live check). Stored dispute state and its display → slice 4 | `executeRefund` |
| C25 | Implemented: revoked certificates are not listed and the PDF 404s even with a valid token | `certificate.service.ts`, `enrollment.repository.ts` |
| C26 | Implemented: a closed conversation rejects sends from both sides; history readable | `messaging.service.ts` `send` |
| AI-L13 | Implemented: concept checks and the learning-path cache are deleted with the course's records | `learningRecords.repository.ts` |

### Accepted for slice 2 only — close in the named slice

Found by the slice-2 final review and `/qa` audit (2026-11-22). Money is never paid wrongly by any
of them; each is a count, a display or a load issue.

- **Refunded held sales stay `pending` (audit Low-3, review #8).** `handleRefund` does not yet move a
  held transfer to `cancelled` (FR-P7), so `getOwedBalance` counts an in-window refund in the
  instructor's pending earnings. The release predicate excludes it, so it is never paid. Closes in
  slice 3 (refund effects).
- **A refund on a `transferring` row is not reversed (C5 remainder).** Slice 2 records the transfer
  and reports the run as failed ("needs a reversal") instead of counting it as released; the
  reversal is slice 3.
- **`account.updated` path is unbounded and noisy (audit Low-4, review #4).** `releaseForInstructor`
  records a `PayoutRun` on every event with payouts enabled, even with nothing to pay, and has no
  batch limit inside the webhook. Rows left `transferring` by a webhook timeout are recovered by the
  daily run. Close with the Payouts panel (slice 5): skip empty runs, cap the batch.
- **Counts only (review #5, #6).** `released` can be over-counted when another path finished the row
  (`markTransferred` returning false is ignored); a `lock.release` error after a good run surfaces as
  a 500 and hides the summary (the run row is written, the lock expires by TTL). Slice 5.
- **The transfers contract test is a tripwire (review #7).** Bracket access, aliasing or
  `transfer_data` on a checkout session would slip past it; review of any new Stripe call remains
  the control.
- **Missing `CRON_SECRET` in production fails closed** — no payouts, no error until slice 5's 48 h
  alert ships. Release checklist: set it before the deploy that ships the hold.

## Open

- **Unverified by the passes:** whether a `ConceptMastery` row references a `ConceptCheck` (matters
  for AI-L13 deletion); production tracing values; whether lesson insights or search return lesson content to students;
  whether a new conversation requires an active enrollment; the exact Stripe refund-failure event
  name.
