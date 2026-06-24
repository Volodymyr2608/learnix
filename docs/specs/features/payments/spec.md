---
feature: payments
status: stable
models: [Payment]
depends-on: [auth, course]
---

## Purpose

Learnix needs to charge students for paid courses and pay instructors their share, with the
platform as merchant of record — see ADR-019 for the full design rationale.

## Functional scope

- One-time per-course purchases via Stripe Checkout (hosted); $0 courses keep instant enrollment.
- Platform takes a commission (`STRIPE_PLATFORM_FEE_PERCENT`, default 20%); the remainder transfers
  to the instructor's Stripe Connect Express account.
- `finalizeCheckout(sessionId)` is the idempotent reconcile point, called from both the
  `checkout.session.completed` webhook and the success page.
- Unonboarded instructors: sale proceeds, payment is left `transferStatus: "pending"`; owed balance
  is the sum of pending `instructorNetCents` (no separate ledger column).
- Pending transfers sweep automatically on `account.updated` (`payouts_enabled: true`), with a manual
  admin sweep (`payment.sweepAllPendingTransfers`) as fallback.

## Acceptance criteria

- A student can complete checkout for a paid course and is enrolled exactly once, even if the
  webhook and the success-page redirect both fire.
- An instructor who completes Connect onboarding after a sale automatically receives the pending
  transfer without needing to retry the purchase.
- `payment.getPlatformRevenue` and the owed-balance calculation are admin-only.

## Agent notes

- `transferToInstructor` checks the **live** Stripe account status, not the cached DB flag — a
  transfer never depends on `account.updated` having arrived.
- See ADR-019 for the full design (commission split, charge model, refunds, webhook handling); this
  spec only tracks current behavior, not the alternatives considered.