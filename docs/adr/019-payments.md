# ADR-019: Payments (Paid Enrollment, Commission & Instructor Payouts)

- **Status**: Accepted
- **Date**: 2026-06

## Context

Enrollment is free for everyone: `course.enroll` → `EnrollmentService.enrollInCourse`
has no payment gating, so the platform earns no revenue (roadmap **P0.2**). Course
prices exist only as display `String`s. We need a complete marketplace payment
system: students pay for paid courses, the platform takes a commission, and
instructors get paid the remainder.

Several axes were open: purchase vs. subscription; how the platform earns; hosted
Checkout vs. embedded element; whether $0 courses flow through Stripe; and how/when
instructors are paid given they may not have a payout account at sale time.

## Decision

Ship **one-time per-course purchases** on **Stripe Checkout (hosted)**, with a flat
**per-sale commission** (default **20%**) and instructor payouts via **Stripe
Connect Express**. Free ($0) courses keep the existing instant-enrollment path.

### Money storage
Migrate `Course.price` `String` → **integer cents** (`priceCents`,
`originalPriceCents`). Stripe operates in the smallest currency unit; cents removes
the fragile `Number(course.price)` coercion. Helper `lib/formatPrice.ts` renders
cents (`0 → "Free"`). Single currency: USD.

### Charge model: separate charges + transfers (platform = merchant of record)
The platform charges the student to **its own account** (hosted Checkout) and moves
the instructor's net with a **separate Stripe `Transfer`**. We **reject** destination
charges (split at checkout) because they require the connected account to exist at
the moment of sale — incompatible with "allow sale, hold funds" (below). This also
keeps refunds simple: refund the charge, reverse the transfer.

### Commission split
On a `succeeded` payment, `finalizeCheckout` computes
`platformFeeCents = round(amountCents * STRIPE_PLATFORM_FEE_PERCENT / 100)` and
`instructorNetCents = amountCents − platformFeeCents` (helper `lib/platformFee.ts`),
persisted on the `Payment`. Stripe's processing fee is absorbed by the platform out
of its commission. The rate is env-configured and affects future sales only.

### Idempotent finalize
`finalizeCheckout(sessionId)` is the single reconcile point, invoked by **both** the
`checkout.session.completed` webhook and the success-page `getSessionStatus` query.
It marks the payment `succeeded`, enrolls the student (reusing `enrollInCourse`),
computes the split, and transfers (or holds). Idempotency makes access grant
self-healing when the webhook lags or local dev has no Stripe CLI listener.

### Allow sale, hold funds + owed ledger
A sale never blocks on instructor onboarding. If the connected account can receive
funds, a `Transfer` of the net is created (`transferred`); otherwise the payment is
left `pending` (owed). The `Payment` row *is* the ledger via a `TransferStatus` enum
(`none | pending | transferred | reversed`); owed balance =
`SUM(instructorNetCents) WHERE transferStatus = 'pending'`. When `account.updated`
reports an account newly enabled, the handler **sweeps** all `pending` payments for
that instructor into transfers.

### Connect Express + KYC + settings surface
`payment.createConnectOnboardingLink` (instructorProcedure) creates the Express
account once (`accounts.create({ type: "express" })`, stored as
`InstructorProfile.stripeAccountId`) and an `account_onboarding` link — the same
endpoint **starts and resumes** KYC. Once onboarded,
`payment.createConnectLoginLink` (`accounts.createLoginLink`) opens the **Express
dashboard**. A live **KYC status** badge (`payment.getConnectStatus` →
`accounts.retrieve`, mapped to *not started / action required / pending review /
verified / restricted*) plus both buttons and the earnings/owed balances live in an
instructor-only **Payouts & verification** card in account settings.

**KYC is owned by Stripe.** Identity/AML verification happens entirely inside Express
onboarding — the platform never collects or stores identity or bank data. An
instructor receives payouts only after Stripe clears verification, surfaced as
`payouts_enabled = true`; later requirement changes are handled by the same
`account.updated` sync. The cached `stripeChargesEnabled` / `stripePayoutsEnabled`
flags drive the transfer/sweep logic; the live retrieve is only for the badge.

### Refunds
`charge.refunded` cancels the enrollment and marks the payment `refunded`;
additionally, if already `transferred`, it creates a transfer **reversal** to claw
back the instructor net (`reversed`); if still `pending`, it drops the owed amount.

### Webhook
`app/api/stripe/webhook/route.ts` runs on the **Node.js runtime** for raw-body
access. It verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET` via
`stripe.webhooks.constructEvent`, de-duplicates on `ProcessedStripeEvent`, then
dispatches `checkout.session.completed` / `charge.refunded` / `account.updated`.
Mirrors the n8n raw-body + signature pattern (ADR-014).

### Layering
Follows ADR-003/004/010/011: `payment.repository` (extends `BaseRepository`) →
`payment.service` + `connect.service` (+ typed `DomainError`s) → `payment` router
(`studentProcedure` checkout, `instructorProcedure` connect/earnings,
`adminProcedure` platform revenue). The Stripe SDK is a module singleton; the tRPC
context is unchanged.

## Consequences

**Positive**
- Revenue is possible; paid enrollment is gated by a real charge with a clear, conventional commission model.
- "Allow sale, hold funds" + sweep means onboarding never blocks revenue.
- Idempotent finalize makes the flow robust to webhook delay and works in local dev without the Stripe CLI.
- Cents storage removes a class of money-math bugs and matches Stripe's unit.
- No PCI surface (hosted Checkout); KYC/payout scheduling/dashboard offloaded to Stripe Express.

**Negative / deferred**
- Separate transfers mean the platform briefly holds instructor funds and bears the transfer/reversal bookkeeping.
- Platform absorbs Stripe processing fees out of its margin.
- One-time purchases only; flat rate only; refunds are dashboard-initiated. No subscriptions, tiered/per-course rates, coupons, multi-currency, or tax/1099 handling.
- The price `String`→cents migration touches every reader/writer of `course.price`, including the course form and the AI course builder.

## Alternatives considered
- **Destination charges (split at checkout)** — simplest Stripe marketplace path, but incompatible with selling before the instructor onboards. Rejected per "allow sale, hold funds".
- **Embedded Payment Element** — more UX control, more frontend state, a PCI-lite surface. Hosted Checkout is faster and offloads compliance.
- **Subscription / fee passthrough / featured-listing fees** — other monetization levers; deferred in favour of a single understandable commission.
- **Standard/Custom Connect** — Standard gives instructors a full separate Stripe account (less UX control); Custom shifts all onboarding/compliance UI to us. Express is the balanced choice.
- **Route $0 courses through Stripe too** — uniform path, but adds latency/friction to free enrollment for no benefit; the existing free path is kept.