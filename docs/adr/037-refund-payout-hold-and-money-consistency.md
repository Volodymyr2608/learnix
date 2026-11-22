# ADR-037: Refund — hold instructor payouts for the refund window, release them from a daily job

- **Status**: Accepted (2026-11-16)
- **Date**: 2026-11
- **Amends**: [ADR-019](019-payments.md) (transfer timing, `TransferStatus`, admin sweep, refunds)
- **Feature**: `refund-self-service`
- **Amended**: 2026-11-16, after the `/spec` security design pass: the release predicate also
  waits out the appeal grace period and refunds in progress (§1); the window starts at a new
  `Payment.paidAt`; recovery after a crash checks Stripe before retrying, because idempotency keys
  expire (§2); the refund effects are gated by a compare-and-set on the payment status, not by event
  dedup (§4)
- **Amended**: 2026-11-22, slice 1 (student request): the account-limit race (security C4) is closed
  with a per-student `pg_advisory_xact_lock` inside the request transaction. This does not contradict
  the rejected "advisory lock around the Stripe call" below: the request transaction makes no
  network call — the facts are counted and the row inserted under the lock, and the Stripe refund
  runs after it commits
- **Amended**: 2026-11-22, slice 2 (hold and release): a payment with no `Payment.paidAt` (sales
  before slice 1, or a charge the checkout did not expand) becomes eligible at `createdAt` + 24 h +
  the window + 1 h; a Checkout Session expires within 24 h, so this bound is never earlier than the
  real one (§1). The run lock (§3.2) has a 15 min TTL, longer than a 300 s Hobby run, and a random
  token released by compare-and-delete; without KV it falls back to a per-process lock in
  development and test only, and refuses to run in production

## Context

Today a refund is dashboard-only: an admin refunds the charge in Stripe, the `charge.refunded`
webhook cancels the enrollment, and — per ADR-019 — the instructor's net is clawed back with a
transfer **reversal** if it was already `transferred`. The refund feature lets a student request a
refund inside Learnix. Five facts shaped this ADR:

1. **Reversals can fail on money that has already left.** If the instructor has already paid out the
   transferred net, the reversal drives their connected balance negative and the platform covers the
   gap. Refunds become routine with this feature, so that risk would grow with every sale.
2. **There is a latent double-transfer bug.** `transferToInstructor` reads the payment, calls
   `transfers.create`, then writes `transferred` (`server/services/payments/connect.service.ts:118-165`).
   Nothing stops a second process in between, and no `idempotencyKey` is used anywhere. Two close
   `account.updated` events run two `sweepPendingTransfers` (`connect.service.ts:167-193`) over the
   same `pending` rows and transfer twice. The bug exists today, independent of refunds.
3. **A refunded `pending` payment is still paid out.** `handleRefund` leaves a `pending` transfer
   untouched (`server/services/payments/payment.service.ts:167-195`), and `sweepPendingTransfers`
   does not check `payment.status`, so an instructor who finishes onboarding after a refund is paid
   for the refunded sale.
4. **The app has no scheduler.** No `vercel.json`, no cron routes, no job queue. ADR-014's n8n cron
   was switched off (commit `b9c2f7d`) to stop paying for the server; ADR-014 still says Accepted.
5. **Refund state arrives only by webhook.** If `charge.refunded` is lost, the money goes back to the
   student while access stays open and the payment stays `succeeded`
   (`app/api/stripe/webhook/route.ts:55-64`).

The product decisions this ADR depends on are recorded in the feature spec, not here:
- refunds are decided **automatically** by fixed rules (window, lesson-opening threshold,
  certificate, account limits);
- only appeals of an automatic denial reach an admin;
- the window is **14 days from payment**;
- the platform keeps absorbing the Stripe fee (ADR-019 unchanged).

## Decision

### 1. The instructor's net is held on the platform until the refund window closes

`finalizeCheckout` no longer transfers at sale time. Every sale stays `pending` until it is
**eligible for release**:

- the refund window has closed (UTC). It runs from `Payment.paidAt`, a new column set server-side in
  `finalizeCheckout` from the Stripe charge's `created`; `createdAt` is checkout creation, not payment;
- there is no open refund request or appeal on the payment (a request filed inside the window holds
  the money until it is decided);
- *(amended 2026-11-16)* there is no automatically denied request whose appeal deadline has not
  passed yet, and no request whose refund is processing or failed at Stripe. Without this the job
  releases during the 3-day appeal grace, and a later approval needs a reversal;
- `payment.status ≠ refunded`, and the charge in Stripe is neither refunded nor disputed (one
  `charges.retrieve` per release; this catches a refund whose webhook was lost);
- the instructor's live `payouts_enabled` is true (unchanged from ADR-019).

Every path that creates a `Transfer` applies this one predicate: the release job, the admin "run
now" action, and the `account.updated` sweep. **No path pays out a held sale early.**

A refund inside the window therefore never needs a reversal: the net is still on the platform
balance, and the transfer is **cancelled** instead. Reversal stays only for refunds after release.

### 2. Transfer state changes are compare-and-set, plus a Stripe idempotency key

`TransferStatus` gains `transferring` and `cancelled`
(`none | pending | transferring | transferred | cancelled | reversed`).

- **Release:** `UPDATE … SET transferStatus = 'transferring' WHERE id = ? AND transferStatus =
  'pending'`. If one row changes, this process owns the transfer and calls Stripe. If zero rows
  change, another process got there first, so it exits. On success the status becomes `transferred`.
- **Refund:** `UPDATE … SET transferStatus = 'cancelled' WHERE id = ? AND transferStatus =
  'pending'`. If zero rows change because the payment is `transferring`, the release finishes first,
  then sees `payment.status = refunded` and immediately reverses.
- **`transfers.create` carries an idempotency key derived from the payment id.** This is the
  second layer: Stripe will not transfer twice even if our guard fails or a call is retried after a
  crash. It also fixes the latent double-transfer bug (Context 2).
- ~~A payment stuck in `transferring` after a crash is retried with the **same key**, which is
  safe.~~ *Amended 2026-11-16:* not safe on its own. Stripe prunes idempotency keys once they are
  at least 24 hours old and then treats a reused key as a new request
  ([Stripe: idempotent requests](https://docs.stripe.com/api/idempotent_requests)), and the daily
  job retries ~24 h ± 59 min later. So `transfers.create` also sets `transfer_group = payment.id`,
  and recovering a `transferring` payment **first lists transfers for that group**: if one exists,
  the payment is marked `transferred` and nothing is created. Refunds (`refunds.list` by payment
  intent) and reversals (`listReversals`) follow the same list-before-retry rule.

Postgres provides the atomicity. No transaction stays open across the network call to Stripe.

### 3. A daily Vercel Cron releases held payouts and reconciles with Stripe

`vercel.json` schedules `GET /api/cron/release-payouts` once a day:

1. It authenticates with `CRON_SECRET` (`Authorization: Bearer …`), compared in constant time and
   declared in `lib/env.js`.
2. A Redis `SET NX` lock with a TTL (`@upstash/redis`, already a dependency) covers the run, because
   Vercel may start a second instance while the first is still running.
3. It selects work **by state**, not by "what changed since yesterday": all eligible `pending`
   payments plus stuck `transferring` ones. A missed or failed run is caught up by the next one.
   Vercel does not retry failed runs, and its own docs recommend this reconciliation style.
4. Each run processes a bounded batch. The Hobby plan allows 300 s per run; the batch size is set
   in the spec, and the rest waits for the next day.
5. The run outcome (time, processed, failures, payment ids) is **written to the database**. Hobby
   keeps logs for only one hour.
6. An email goes to the admin (Resend) when a run fails or when there has been no successful run
   for more than 48 hours.
7. The admin **Sweep** button (`payment.sweepAllPendingTransfers`) becomes **"Run job now"**. It
   runs the same code with the same predicate. In its current form it would pay out every
   `pending` sale, held and refunded ones included.

### 4. Refund effects apply synchronously; the same cron replays missed Stripe events

- **Synchronous path:** when Learnix itself calls `refunds.create`, which is the normal path, the
  effects apply as soon as the call succeeds, without waiting for the webhook. The effects are:
  - payment refunded;
  - transfer cancelled or reversed;
  - enrollment cancelled;
  - learning records cleared;
  - certificate revoked where applicable.

  The webhook that arrives later is a no-op. *Amended 2026-11-16:* the gate is one compare-and-set,
  `UPDATE payments SET status = 'refunded' WHERE id = ? AND status = 'succeeded'`; only the caller
  that changes the row applies the effects, and the database effects run in the same transaction.
  `ProcessedStripeEvent` dedup is check-then-record (`app/api/stripe/webhook/route.ts:44`, `:85`),
  so with the replay as a second concurrent caller it is an optimisation, not the guarantee.
- **Reconciliation:** the daily run reads `charge.refunded` and refund-failure events from
  `GET /v1/events` since a stored cursor and feeds them through **the same handler** the webhook
  uses. This covers dashboard refunds and refunds that fail later. Event handling therefore moves
  out of the route's `switch` into a service that both callers share.

## Consequences

**Positive**
- A refund inside the window costs the instructor nothing to claw back and the platform no
  negative-balance risk: the money never left.
- The double-transfer bug is fixed (idempotency key + compare-and-set), and so is the
  paid-out-after-refund bug (cancel + release predicate).
- One release path and one event handler: the admin button, the cron, the KYC sweep and the
  webhook cannot drift apart.
- Stripe disagreement is bounded: a lost webhook is corrected within a day, and a release is checked
  against the live charge first.

**Negative / accepted**
- **Instructors wait for their money:** 14 days in the normal case. In the worst case (appeal +
  admin review) it is window + 3 days + up to 14 days ≈ 31 days. This is the direct price of the
  hold.
  *Amended 2026-11-21:* the ≈ 31-day bound holds only when the admin decides on time. After T11
  (`refund-self-service/discovery/decisions.md`) a direct, threshold or account-limit appeal is never
  auto-approved, so its money stays held until the admin decides, with no upper bound.
- New infrastructure inside the app: a cron route, a secret, a run-history table, an admin payouts
  page, and an admin email.
- Daily granularity: a missed run delays payouts by a day. Hobby allows one run per day, with
  ±59 min accuracy.
- `transferring` is a new state that a crash can leave behind. Recovery depends on the retry using
  the same key.
- Reconciliation depends on Stripe's 30-day event retention. A cron outage longer than 30 days
  loses events. The 48 h alert fires long before that.
- **Rollout is two steps.** First the hold ships alone. Fourteen days later, the student-facing
  refund button is enabled behind a feature flag. By then every purchase that can still be refunded
  is already held, so there is no transition case of refunding an already-`transferred` sale.

**Risks to verify before real money**
- Vercel Cron is labelled legacy and is moving to Schedules (beta). The migration path has not been
  assessed.
- Commercial use on the Hobby plan has **not been verified**: the terms page did not load.
- ADR-014 must be marked superseded in its own, separate change.

## Alternatives considered

- **Keep transferring at sale, rely on reversals** (status quo). This needs no new infrastructure,
  but every in-window refund becomes a reversal against money the instructor may already have paid
  out, and the platform covers the shortfall. Rejected.
- **Hold on the Stripe side with `delay_days`.** It applies only to `on_behalf_of` or direct
  charges. Our model is separate charges and transfers without `on_behalf_of` (ADR-019), so
  switching would change the settlement country, fees and statements. It also breaks transfer
  cancellation (§2). Rejected.
- **Manual payout schedule on connected accounts.** The money still reaches the instructor's
  balance, so cancellation becomes a reversal again, and someone still has to trigger payouts.
  Rejected.
- **Row lock (`SELECT … FOR UPDATE`) or a Postgres advisory lock** around the Stripe call. Both hold
  a transaction open across a network call. Rejected. (A short advisory lock with no network call inside is used for
  the account limit; see the 2026-11-22 amendment.)
- **A Redis distributed lock per payment.** Money consistency would then depend on a second store.
  Redis is used only to stop overlapping runs. Rejected.
- **A job queue for all transfer operations.** It removes races by construction, but it is the
  most new infrastructure. Revisit if a queue arrives for other reasons.
- **Other schedulers:**
  - n8n cron: switched off for cost.
  - GitHub Actions schedule: CI as a production scheduler, with no timing guarantee.
  - Lazy release on the next event: an inactive instructor is never paid.
  - `node-cron`: no long-lived process on Vercel.
  - Upstash QStash: one more service.

  All rejected.
- **Reconcile via `GET /v1/refunds` or a per-payment charge check.** The first is a second code path
  next to the webhook that will drift. The second is N calls a day that hit the 300 s limit.
  Rejected in favour of replaying events through the shared handler.

## Revisit when

- There is no successful run for more than 48 h more than once a month, or runs keep hitting the
  batch limit. Then move to the Pro plan (more frequent runs) or Vercel Workflows.
- Any payment stays in `transferring` longer than one retry cycle.
- Reconciliation finds an event that the webhook missed and Stripe did not retry. Then check the
  endpoint configuration.
