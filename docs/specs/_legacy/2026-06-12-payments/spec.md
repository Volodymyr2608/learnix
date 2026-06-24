# Spec: Payments (Paid Enrollment, Commission & Instructor Payouts)

> Behavioural requirements / scope live in [`requirements.md`](./requirements.md); the
> implementation plan in [`plan.md`](./plan.md); checks in [`validation.md`](./validation.md).
> Decision record: [`docs/adr/019-payments.md`](../../adr/019-payments.md).

## Architectural decisions referenced

- **ADR-003** — routers → services → repositories; services bind repository singletons.
- **ADR-004** — `studentProcedure` / `instructorProcedure` / `adminProcedure` enforce role at the tRPC layer.
- **ADR-010** — typed domain errors (`DomainError`) mapped to tRPC via `handleServiceError`.
- **ADR-011** — component-folder architecture (colocated `types.ts`) for new UI.
- **ADR-014** — raw-body + signature-verification webhook pattern (n8n routes) is the template for the Stripe webhook.
- **ADR-019 — Payments** (this feature's decision record).

## Data model

### `prisma/schema/payments.prisma` (new)

```prisma
enum PaymentStatus  { pending succeeded failed refunded }
enum TransferStatus { none pending transferred reversed }

model Payment {
  id           String @id @default(cuid())
  studentId    String
  student      User   @relation("StudentPayments", fields: [studentId], references: [id], onDelete: Cascade)
  courseId     String
  course       Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  instructorId String                      // denormalized for revenue/payout queries
  instructor   User   @relation("InstructorPayments", fields: [instructorId], references: [id], onDelete: Cascade)

  amountCents        Int           @map("amount_cents")
  currency           String        @default("usd")
  status             PaymentStatus @default(pending)

  // commission split + payout ledger
  platformFeeCents   Int?           @map("platform_fee_cents")
  instructorNetCents Int?           @map("instructor_net_cents")
  transferStatus     TransferStatus @default(none) @map("transfer_status")
  stripeTransferId   String?        @unique @map("stripe_transfer_id")
  transferredAt      DateTime?      @map("transferred_at")

  stripeCheckoutSessionId String? @unique @map("stripe_checkout_session_id")
  stripePaymentIntentId   String? @unique @map("stripe_payment_intent_id")

  refundedAt DateTime? @map("refunded_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt       @map("updated_at")

  @@index([instructorId])
  @@index([studentId])
  @@index([courseId])
  @@map("payments")
}

// Webhook idempotency — one row per processed Stripe event id.
model ProcessedStripeEvent {
  id          String   @id            // Stripe event id (evt_...)
  type        String
  processedAt DateTime @default(now()) @map("processed_at")
  @@map("processed_stripe_events")
}
```

`transferStatus`: `none` (free/unfinalized) · `pending` (owed, awaiting sweep) ·
`transferred` (Stripe `Transfer` created) · `reversed` (refunded after transfer).
Owed balance for an instructor = `SUM(instructorNetCents) WHERE transferStatus = 'pending'`.

### `prisma/schema/course.prisma` (modified)

- Add `priceCents Int @default(0) @map("price_cents")`, `originalPriceCents Int? @map("original_price_cents")`, `payments Payment[]`.
- **Drop** the old `price` / `originalPrice` `String` columns **after** backfilling in the migration:
  `UPDATE courses SET price_cents = ROUND(CAST(price AS DECIMAL) * 100)` (and `original_price` where not null). Hand-edit the migration so the backfill runs before the drop.

### `prisma/schema/instructor.prisma` (`InstructorProfile`, modified)

```prisma
stripeAccountId      String?   @unique @map("stripe_account_id")
stripeChargesEnabled Boolean   @default(false) @map("stripe_charges_enabled")
stripePayoutsEnabled Boolean   @default(false) @map("stripe_payouts_enabled")
stripeOnboardedAt    DateTime? @map("stripe_onboarded_at")
```

### `prisma/schema/auth.prisma` (`User`, modified)

Add the named back-relations: `studentPayments Payment[] @relation("StudentPayments")`,
`instructorPayments Payment[] @relation("InstructorPayments")`.

## Environment variables (new)

| Variable | Required | Purpose |
|----------|----------|---------|
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret (server) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Signing secret for the **platform** webhook endpoint (`checkout.session.completed`, `charge.refunded`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Yes | Signing secret for the **Connect** webhook endpoint (`account.updated`) |
| `STRIPE_PLATFORM_FEE_PERCENT` | No (default 20) | Flat commission rate, integer percent |

Two separate Stripe webhook endpoints point at the same `/api/stripe/webhook` URL —
one scoped to **Your account** (platform events), one to **Connected accounts**
(Connect events). The route detects which secret to use via the `Stripe-Account`
header: present → Connect secret; absent → platform secret. Connect Express account
links and login links are created via the API with `STRIPE_SECRET_KEY`; no client id
or publishable key is needed. Return/refresh URLs come from the existing `BASE_URL`.

## Components / flow

```
PURCHASE
  Buy now ──► payment.createCheckoutSession (studentProcedure)
                guard rails (FR5) → Payment(pending) → stripe.checkout.sessions.create
                ──► { url } → redirect to Stripe hosted page (charge to platform account)
  Stripe ──► checkout.session.completed ─┐
  success page (getSessionStatus) ───────┼─► finalizeCheckout(sessionId)  ◄── idempotent
                                          │     mark succeeded + enrollInCourse (reused)
                                          │     computeSplit + maybeTransfer (FR8–FR10)
  Stripe ──► charge.refunded ──► handleRefund → cancel enrollment + reverse transfer if transferred (FR7)

INSTRUCTOR CONNECT (Settings → Payouts card; reads payment.getConnectStatus)
  ├─ no account / incomplete ──► "Set up payouts" / "Continue verification"
  │     payment.createConnectOnboardingLink → accounts.create({type:"express"}) (once) + accountLinks.create({type:"account_onboarding"})
  └─ onboarded ──► "Open Stripe dashboard"
        payment.createConnectLoginLink → accounts.createLoginLink(accountId)
  Stripe (Connect endpoint) ──► account.updated ──► sync charges/payouts flags; if newly enabled → sweep pending transfers (FR11)
```

`finalizeCheckout` is the single **idempotent** reconcile point, called by both the
webhook and the success-page `getSessionStatus` query — so access grant is
self-healing if the webhook lags or local dev has no Stripe CLI listener.

`getConnectStatus` retrieves the account live (`accounts.retrieve`) to derive the
FR16 badge from `details_submitted` / `payouts_enabled` / `requirements.*`. The
cached `stripeChargesEnabled` / `stripePayoutsEnabled` flags are a denormalised
mirror updated by `syncAccountStatus`; the live retrieve is only for the settings
badge. `transferToInstructor` checks live `payouts_enabled` directly so a transfer
never depends on `account.updated` having arrived.

## File list

**New**
- `prisma/schema/payments.prisma`.
- `server/services/payments/stripe.client.ts` — Stripe SDK singleton.
- `server/services/payments/payment.service.ts` — `createCheckoutSession`, `finalizeCheckout`, `handleRefund`, `getInstructorEarnings`.
- `server/services/payments/connect.service.ts` — `createOnboardingLink`, `createLoginLink`, `getConnectStatus`, `syncAccountStatus`, `transferToInstructor`, `sweepPendingTransfers`, `reverseTransfer`.
- `server/services/payments/payment.errors.ts` — `PaymentError` + specific errors.
- `server/repositories/payment.repository.ts` — `extends BaseRepository`, revenue/owed aggregation.
- `server/entities/payment.ts` — Zod DTOs.
- `server/api/routers/payment.ts` — student checkout, instructor connect/earnings, admin revenue.
- `app/api/stripe/webhook/route.ts` — Node-runtime webhook handler.
- `app/dashboard/checkout/success/page.tsx` — post-checkout confirmation + reconcile.
- `lib/formatPrice.ts` — `cents → "$49.00" | "Free"`.
- `lib/platformFee.ts` — `computeSplit(amountCents, feePercent)`.
- `lib/connectStatus.ts` — derive the FR16 status enum from a retrieved account.
- **Settings "Payouts & verification" section** (instructor-only) in the account-settings hub (`SettingsShell` + section pattern, ADR-011).
- `docs/adr/019-payments.md`.

**Modified**
- `prisma/schema/course.prisma`, `prisma/schema/instructor.prisma`, `prisma/schema/auth.prisma`.
- `lib/env.js` + CLAUDE.md env table.
- `server/api/root.ts` — register `payment` router.
- Price readers: `BrowseCourseCard`, `CourseDetailEnrollCard` (+ discount badge), instructor preview, `course.service.ts`, `course.repository.ts`.
- Price writers: course Zod entity, `course.service.ts` create/update, course form (`useCourseForm` + inputs, dollars→cents), AI course-builder price persistence.
- `EnrollConfirmDialog` / enroll CTAs — branch free vs paid.