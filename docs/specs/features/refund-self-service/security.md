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

**No AI surface is added by this feature**, except that the existing lesson tutor can serve lesson
content without an "opened" record (T9); that half goes to `llm-security-auditor`.

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
| C1 | IDOR: request, appeal or status for another student's payment | M×H | Student-only endpoints take a course id only; the payment is resolved by the session's student id in the same query that authorizes; every later step uses that row | FR-S1, S5, S12 |
| C2 | The client chooses the refund amount or target | L×H | `refunds.create` with the stored payment intent and no `amount`; strict input with no money fields | FR-S6 |
| C3 | Double submit creates two requests or two refunds | H×M | Unique request and appeal per payment in the database; idempotency key per payment; `charge_already_refunded` reconciles instead of failing | FR-S7 |
| C4 | Race on the account limit: parallel requests all pass | M×M | Count and insert in one transaction under a per-student lock; no network call inside; in-progress refunds count | FR-S2 |
| C5 | Refund vs release at the window edge | L×H | The release claim is one conditional update carrying the full predicate; 1 h grace margin; reversal as the last line | FR-P2, P4 |
| C6 | Release during the appeal grace or while a refund is processing or failed | M×H | Predicate amended (ADR-037 §1) | FR-P2a |
| C7 | Transfer twice after a crash, once the idempotency key has expired (~24 h) | M×H | `transfer_group = payment.id`; list before retry, for transfers, refunds and reversals (ADR-037 §2) | FR-P4 |
| C8 | Effects applied twice by the webhook and the replay concurrently | H×M | One compare-and-set on payment status gates all effects; database effects in the same transaction (ADR-037 §4) | FR-P14, P15 |
| C9 | Reading lessons without an "opened" record (fail-open write; the tutor route) | M×M | Record written before content is returned, fail-closed, on every content path | FR-P19 |
| C11 | Overdue auto-approval as an unlimited bypass | M×M | Only appeals after an automatic denial are auto-approved (decision T11) | FR-A5 |
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
- **An instructor buying their own course from another account.** Gains nothing over a normal sale.
- **"On hold past day 14 means an appeal"** for an instructor with one sale (decision A6).
- **A compromised admin refunding in bulk.** The admin is trusted by design; the audit detects it.
- **A partial Dashboard refund disputed for the full amount.** Stripe-side, rare, the platform bears
  it (OQ-7a).

## Open

- **T9, the tutor half:** the lesson tutor loads lesson content without an "opened" record
  (`app/api/chat/lesson/route.ts:45-90`). To `llm-security-auditor` in design mode.
- **Unverified by the pass:** whether lesson insights or search return lesson content to students;
  whether a new conversation requires an active enrollment; the exact Stripe refund-failure event
  name.
