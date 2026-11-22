# Refund self-service — Slice 4: disputes — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Steps use checkbox (`- [ ]`) syntax. See
> [`../spec.md`](../spec.md) for the design and Acceptance criteria. Earlier slices:
> [`plan.md`](plan.md), [`plan-slice-2.md`](plan-slice-2.md), [`plan-slice-3.md`](plan-slice-3.md).

**Goal:** Learnix knows, without calling Stripe, whether a payment's charge is under dispute; an open
dispute blocks the student's refund and the payout; a dispute closed **lost** is one more refund path
through the same effects function; a dispute closed **won** clears the state.

**Architecture:** Dispute events (`charge.dispute.created`, `.updated`, `.closed`) go through the
shared `stripeEventService` — by webhook and by the daily replay — and set `Payment.disputeState`
(FR-P18a). A lost dispute calls `refundEffectsService.apply({ path: "lost_dispute" })`; the payment
records its `refundSource` (FR-P18b). The refund rules, `executeRefund` and the release read the stored
state instead of the live `charge.disputed` flag, which stays `true` even after a won dispute.

**Spec:** [`../spec.md`](../spec.md) FR-P18, FR-P18a, FR-P18b, FR-S2 (no open dispute), FR-S11 (server
part), FR-P7 (no reversal after a lost dispute), DL, EC-18; [`../security.md`](../security.md) C12 and
the slice-3 accepted risk "two reversers ignore the lost-dispute rule";
[ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md) §1 (release predicate),
§4 (one handler, replay).

**Track:** `pnpm classify` on 2026-11-22 → **guarded** (money path, migration). Each control gets its
own test. `security-auditor` audits at `/qa`; no AI surface changes.

**Reconnaissance:** no `feature-dev:code-explorer` dispatch. Every surface this slice touches was
written in slices 1–3 of this session; the anchors below come from direct reads. A cold agent would
re-read the same files to reach the same lines.

### Scope of this slice

**In:** stored dispute state and its events (webhook + replay), the open-dispute condition in the
refund rules (replacing slice 1's `hasOpenDispute: false`), FR-P18 (no refund of a disputed charge,
`charge_disputed` handled as the dispute state), FR-P18b (lost dispute = refund path; counts for D3
and the account limit; open request closed "refunded by the bank"; won clears), the release predicate
reading the stored state, no reversal after a lost dispute in all three reversers.

**Out:** the FR-S11 page text and the Purchases row (slice 7); the admin email on a lost dispute
(FR-S21 notification matrix, slices 5/8); appeals closed by a lost dispute (slice 8 — the same code
path will close them).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| D1 | `Payment.disputeState` (`open` / `won` / `lost`, null = never disputed) and `disputeUpdatedAt` (the Stripe event's `created`) | FR-P18a needs a stored state; `charge.disputed` stays true after a won dispute, so it cannot be the signal | Where the state lives |
| D2 | An event older than `disputeUpdatedAt` is ignored | Webhook and replay deliver out of order; a late `dispute.created` must not reopen a closed dispute | Event ordering |
| D3 | `Payment.refundSource` (`refund_request` / `dashboard_refund` / `admin_exception` / `lost_dispute`), written by `apply` | FR-P18b: "the payment records the source 'lost dispute'"; the counting rules and the reversers need it | — |
| D4 | Counting refunds (D3) and account-limit refunds count **distinct payments**: approved requests ∪ lost-dispute payments | A student whose approved request was then lost at the bank must not count twice | DL vs OQ-2 overlap |
| D5 | A processing request on a payment lost at the bank becomes `refundState = refunded_by_bank` | FR-P18b "closed as refunded by the bank"; no Stripe refund must be retried for it | New state value |
| D6 | The release blocks on stored `open` / `lost`; the live check still refuses `charge.refunded`, and refuses `charge.disputed` only when the stored state is not `won` | Keeps the live safety net for a missed dispute event without blocking a won dispute forever (slice-3 audit M-2a) | Live vs stored |
| D7 | `executeRefund` reads the stored state; Stripe's `charge_disputed` error sets the payment `open` and records "charge disputed" (FR-P18) | The live flag stays true after a win; the error is the dispute state, not a failure | — |
| D8 | Replay covers `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` under one cursor key `stripe_events` (first run 30 days back again) | One list call, one cursor; a re-read duplicate is a no-op (C8, D2) | Slice-3 R6 extended |
| D9 | A dispute `closed` with status `won` or `warning_closed` → `won`; `lost` → `lost`; any other status (e.g. `prevented`) → `won` (money stays) | Stripe's closing statuses; only `lost` returns the money to the customer | Status mapping |

Each is logged in `discovery/ai-decision-log.md` in Task 9.

**Codebase anchors (verified during planning):**
- Refund rules: `decideRefund` condition `dispute: !facts.hasOpenDispute` (`server/services/refund/refundRules.ts:40`); `requestRefund` hard-codes `hasOpenDispute: false` (`server/services/refund/refund.service.ts:104`).
- `executeRefund` live check `if (charge?.disputed)` (`refund.service.ts:170`); `createStripeRefund` handles `charge_already_refunded` (`:236`).
- Counting: `hasCountingRefund` and `countAccountLimitRefunds` count `auto_approved` rows only (`server/repositories/refundRequest.repository.ts:71-95`).
- Release predicate fragment `eligible` with `NOT EXISTS` on requests (`server/repositories/payout.repository.ts:22-39`); `releasePayment` live check `charge.refunded || charge.disputed` (`server/services/payments/connect.service.ts:168`); `recordTransfer` reverses when `isRefunded` (`:221-235`); `findRefundedTransferred` feeds the reversal retry (`payout.repository.ts:131`, `payoutJob.service.ts:70-80`).
- Effects: `claimRefund` / `applyInTx` (`server/repositories/refundEffects.repository.ts:17,30`); `apply` skips the reversal for `lost_dispute` (`server/services/refund/refundEffects.service.ts:50`); `REVOCATION_REASON` already maps `lost_dispute` (`:14`).
- Events: `stripeEventService.handle` switch, `charge.refunded` → `chargeRefunded` (`server/services/payments/stripeEvent.service.ts:27,53`).
- Replay: `REPLAYED_EVENT = "charge.refunded"` and its use in `replayRefundEvents` (`server/services/payments/payoutJob.service.ts:27,89-119`).
- Tests to extend: `stripeEvent.service.test.ts`, `refundEffects.service.integration.test.ts`, `payoutJob.replay.integration.test.ts`, `payout.repository.integration.test.ts`, `executeRefund.test.ts`, `refund.service.integration.test.ts`, `connect.service.test.ts`.

**Per-task conventions:** as slices 2–3 — `pnpm typecheck` + `pnpm check` clean before each commit;
arrow consts; integration tests on `learnix_test`; migrations by `prisma migrate diff` from the
committed schema.

---

## Task 1 — Schema: dispute state, refund source, "refunded by the bank"

- **Contract:** `Payment.disputeState DisputeState?` (`open | won | lost`), `Payment.disputeUpdatedAt
  Int?` (Stripe event `created`, seconds), `Payment.refundSource RefundSource?` (`refund_request |
  dashboard_refund | admin_exception | lost_dispute`); `RefundState` gains `refunded_by_bank`.
- **Test:** `server/repositories/disputeSchema.integration.test.ts` — the new columns and enum value
  round-trip.
- **Files:** `prisma/schema/payments.prisma`, `prisma/schema/refund.prisma`, migration
  `prisma/migrations/20261125120000_disputes/migration.sql`.
- **AC:** prerequisite.
- **Commit:** `feat(refund): schema for dispute state and refund source`

- [ ] Failing test · [ ] FAIL · [ ] Schema + migration + generate · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — The effects function records its source; a lost dispute closes the request as "refunded by the bank"

- **Contract:** `applyInTx` writes `refundSource = path` on the payment; for `lost_dispute` a
  `processing` request becomes `refunded_by_bank` instead of `refunded` (D3, D5).
- **Test:** `refundEffects.service.integration.test.ts` — `refundSource` per path; lost dispute with a
  processing request → `refunded_by_bank`, share `cancelled`, enrollment `cancelled`, certificate
  revoked "lost_dispute", no reversal of a released share (existing case kept).
- **Files:** `server/repositories/refundEffects.repository.ts`, test.
- **AC:** AC-F22 (effects part), FR-P18b.
- **Commit:** `feat(refund): refund effects record their source; lost dispute closes the request`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — Dispute events set the stored state; a lost dispute is a refund path

- **Contract:** `stripeEventService.handle`:
  - `charge.dispute.created` / `.updated` with an open status → `disputeState = open`;
  - `charge.dispute.closed` → `won` / `lost` per D9; on `lost`, `apply({ path: "lost_dispute" })`;
  - the payment is found by the dispute's `payment_intent`; an event whose `created` is older than
    `disputeUpdatedAt` changes nothing (D2).
- **Code included: the ordered state update is the money guard** — one conditional statement:
  ```sql
  UPDATE payments SET dispute_state = $state, dispute_updated_at = $eventCreated
   WHERE stripe_payment_intent_id = $pi
     AND (dispute_updated_at IS NULL OR dispute_updated_at <= $eventCreated)
  ```
- **Test:** `stripeEvent.service.test.ts` (mapping, path) and
  `server/services/payments/disputeEvents.integration.test.ts` — created → open; closed lost → effects
  once, `refundSource = lost_dispute`; closed won → `won`, no effects; a late `created` after `closed`
  leaves the state closed; the same `closed lost` twice → effects once.
- **Files:** `server/services/payments/stripeEvent.service.ts`, `server/repositories/payment.repository.ts`
  (`recordDisputeState`), tests.
- **AC:** AC-F22, AC-C12 (state set and cleared), FR-P18a, FR-P18b.
- **Commit:** `feat(refund): dispute events set the stored state; a lost dispute refunds`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] Break it: drop the `dispute_updated_at` guard, see the out-of-order test go red, restore · [ ] typecheck + check · [ ] Commit

## Task 4 — Lost disputes count for D3 and the account limit, once per payment

- **Contract:** `hasCountingRefund` and `countAccountLimitRefunds` count distinct payments that have
  an approved request **or** `refundSource = lost_dispute` (D4); the account limit uses the request's
  `createdAt` or the payment's `refundedAt` for a dispute.
- **Test:** `refund.service.integration.test.ts` — a lost-dispute payment on another course counts
  toward the limit (2 approved + 1 lost → the next request is denied `account_limit`); a lost dispute
  on the same course blocks a refund of a repurchase (D3); an approved request later lost at the bank
  counts once.
- **Files:** `server/repositories/refundRequest.repository.ts`, test.
- **AC:** AC-F22 ("the next request on the account sees one more account-limit refund"), DL.
- **Commit:** `feat(refund): lost disputes count toward D3 and the account limit`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — The student's refund reads the stored dispute state

- **Contract:** `requestRefund` sets `hasOpenDispute` from `payment.disputeState = 'open'` (an open
  dispute → `auto_denied` naming `dispute`); `executeRefund` refuses on stored `open` instead of the
  live flag and, on Stripe's `charge_disputed`, sets the payment `open` and records "charge disputed"
  (D7, FR-P18).
- **Test:** `refund.service.integration.test.ts` — open dispute → denied with `dispute`; a won dispute
  with the live flag still true → refunded; `executeRefund.test.ts` — `charge_disputed` → processing,
  stored state `open`.
- **Files:** `refund.service.ts`, `refundRequest.repository.ts` (`findRequestablePayment` selects
  `disputeState`), `payment.repository.ts`, tests.
- **AC:** AC-C12 (no refund on any path), FR-S2, FR-P18.
- **Commit:** `feat(refund): the student's refund reads the stored dispute state`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — The release reads the stored dispute state

- **Contract:** the `eligible` SQL predicate also requires `dispute_state IS NULL OR dispute_state =
  'won'`; `releasePayment`'s live check refuses `charge.disputed` only when the stored state is not
  `won` (D6).
- **Code included: release predicate on the money path** — the added clause is exactly
  `AND (p.dispute_state IS NULL OR p.dispute_state = 'won')`.
- **Test:** `payout.repository.integration.test.ts` — open and lost not claimed, won claimed;
  `connect.service.test.ts` — live disputed + stored won → released, live disputed + stored null →
  `charge_not_payable`.
- **Files:** `payout.repository.ts`, `connect.service.ts`, tests.
- **AC:** AC-F30 (disputed payment not released), FR-P2a.
- **Commit:** `feat(refund): the release reads the stored dispute state`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — No reversal after a lost dispute, on every path

- **Contract:** `recordTransfer` does not reverse, and `findRefundedTransferred` does not return, a
  payment with `refundSource = lost_dispute` (DL; closes the slice-3 accepted risk).
- **Test:** `connect.service.test.ts` — transfer recorded for a lost-dispute payment → no reversal;
  `payoutJob.replay.integration.test.ts` — the reversal retry skips a lost-dispute payment.
- **Files:** `connect.service.ts`, `payout.repository.ts` (`isRefunded` → `refundSourceOf`), tests.
- **AC:** FR-P7 exception, DL.
- **Commit:** `feat(refund): no reversal after a lost dispute on any path`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — The daily replay includes dispute events

- **Contract:** `replayRefundEvents` lists the four event types of D8 under cursor `stripe_events`
  and handles them oldest first through `stripeEventService.handle`.
- **Test:** `payoutJob.replay.integration.test.ts` — a `charge.dispute.closed` (lost) that never
  arrived by webhook is applied once by the replay (AC-F26 dispute part); `events.list` is called with
  the four `types`.
- **Files:** `payoutJob.service.ts`, test.
- **AC:** AC-F26 (dispute part), FR-P18a.
- **Commit:** `feat(refund): the daily replay includes dispute events`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains D1–D9 and where the code differed; `security.md` slice-4
  control status (C12 implemented except the page text) and the slice-3 "two reversers" risk closed;
  `spec.md` stays `in-progress`. Deploy note: subscribe the webhook endpoint to the three dispute
  events.
- **Commit:** `docs(refund): record slice-4 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** here, the ordered dispute-state update (Task 3) and the release
predicate clause (Task 6).

## Self-review

**Spec coverage — in this slice:**

| AC | Task | Covered |
|---|---|---|
| AC-F22 | 2, 3, 4, 7 | Full: lost on a held payment → effects once, share cancelled, open request closed, +1 account-limit refund; on a released one no reversal; won clears |
| AC-F26 | 8 | Dispute part (the refund part shipped in slice 3) |
| AC-F30 | 6 | Disputed payment not released (the refund part shipped in slice 3; the job email → slice 5) |
| AC-C12 | 3, 5, 6 | No `refunds.create` on a disputed charge on any path; events set and clear the state. "Rendering the Purchases page makes no Stripe call" → slice 7 (the page reads the stored state) |

**Deferred:** the FR-S11 text and Purchases row (slice 7); the lost-dispute email (slices 5/8); appeals
closed by a dispute (slice 8).

**Guarded coverage:** C12 → Tasks 3, 5, 6 (break-it in 3); DL → Tasks 2, 4, 7. Each has its own test.

**Contract clarity / type consistency:** `DisputeState`, `RefundSource` (Task 1) are used by Tasks
2–7; `recordDisputeState` (Task 3) by Task 5 (`charge_disputed`); `refundSource` written in Task 2 is
read in Tasks 4 and 7.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it: Task 3 (ordering guard).
- Manual, Stripe test mode: pay with the dispute test card (`4000 0000 0000 0259`) → the webhook sets
  `dispute_state = open`; a student request is denied `dispute`; the job does not release it. Lose the
  dispute (submit `losing_evidence`) → effects applied, `refund_source = lost_dispute`, no reversal.
- Before deploy: subscribe the webhook endpoint to `charge.dispute.created`, `.updated`, `.closed`;
  migrations in every environment.
