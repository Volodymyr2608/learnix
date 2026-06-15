# Validation: Payments

## Automated checks
- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.

### Unit tests (`*.test.ts`, no DB, Stripe client mocked)
- `lib/formatPrice.ts`: `0 → "Free"`, `4900 → "$49.00"`, `4999 → "$49.99"`.
- `lib/platformFee.ts`: `computeSplit(10000, 20) → { platformFeeCents: 2000, instructorNetCents: 8000 }`; rounding on odd amounts.
- `lib/connectStatus.ts`: each account shape → correct status (`not_started` / `action_required` / `pending_review` / `verified` / `restricted`).
- `payment.service.finalizeCheckout` **idempotency**: second call on an already-`succeeded` session does not re-enroll, re-split, or re-transfer.
- `payment.service.createCheckoutSession` guard rails (FR5): free → `CourseIsFreeError`; own course → rejected; already enrolled → `AlreadyEnrolledError`; unpublished/deleted → `CourseNotFoundError`.
- `handleRefund`: `transferred` sale → reversal + enrollment cancelled; `pending` sale → owed dropped, no reversal.
- Transfer decision: onboarded (`payouts_enabled`) → `transferred`; not → `pending`.

### Integration tests (`*.integration.test.ts`, `learnix_test`)
- `payment.repository` CRUD + lookups + revenue/owed aggregation against the real schema.
- `createCheckoutSession` persists a `pending` Payment with `stripeCheckoutSessionId` (Stripe mocked).
- `finalizeCheckout` creates **exactly one** enrollment and one `succeeded` payment when called twice.
- `sweepPendingTransfers` flips all the instructor's `pending` payments to `transferred`.
- `handleRefund` flips both the payment and its enrollment (and `reversed` when transferred).

## Manual test scenarios (Stripe test mode + Connect)

Prereqs:
```bash
# Forwards both platform and Connect events to the same local route.
# The single whsec_... can be used for both STRIPE_WEBHOOK_SECRET and
# STRIPE_CONNECT_WEBHOOK_SECRET in local dev.
stripe listen \
  --forward-to localhost:3000/api/stripe/webhook \
  --forward-connect-to localhost:3000/api/stripe/webhook
# Copy whsec_... into both STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET.
# Set STRIPE_SECRET_KEY (test) and STRIPE_PLATFORM_FEE_PERCENT=20. Restart dev server.
pnpm dev
```

**Production:** create two separate Stripe webhook endpoints at
`https://<app>/api/stripe/webhook` — one scoped to **Your account** (events:
`checkout.session.completed`, `charge.refunded`), one scoped to **Connected
accounts** (event: `account.updated`). Each produces its own `whsec_...` signing
secret; set them as `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET` in
Vercel env vars.

1. **Onboard an instructor:** Settings → Payouts & verification → "Set up payouts" → complete Stripe Express test onboarding → return → badge shows **Verified**, "Open Stripe dashboard" appears and opens the Express dashboard.
2. **Paid purchase (onboarded instructor):** buy a paid course with `4242 4242 4242 4242` → land on success page → enrolled, learn page accessible, `Payment` `succeeded` with `platformFeeCents`/`instructorNetCents`, a `Transfer` created, instructor "available" balance + platform revenue increment.
3. **Free course:** $0 course still instant-enrolls, no Stripe redirect, no `Payment`.
4. **Guard rails:** own-course buy and already-enrolled buy are rejected before any Stripe call.
5. **Sale before onboarding ("hold funds"):** with an *un-onboarded* instructor, buy their course → student enrolled, `Payment` `succeeded` but `transferStatus = pending`, instructor "pending (owed)" balance shows the net, badge shows **Action required**.
6. **Onboarding sweep:** complete that instructor's onboarding → `account.updated` → previously `pending` payment becomes `transferred`, owed→available.
7. **Cancel:** start checkout, hit Stripe's back arrow → no enrollment, `Payment` stays `pending`.
8. **Refund:** refund a transferred payment in the Dashboard → enrollment `cancelled`, `Payment` `refunded`, transfer **reversed**, balances/revenue decrement, learn page no longer accessible.
9. **Idempotency:** `stripe events resend <evt_id>` → no duplicate enrollment, split, or transfer.
10. **Webhook-lag fallback:** stop the Stripe CLI, complete a purchase → success page `getSessionStatus` still finalizes (proves the redirect path self-heals).

## Price-migration sanity
- Existing courses display the same prices post-migration (spot-check `price_cents` vs old strings).
- Creating/editing a course stores the entered dollar amount as the correct cents value.