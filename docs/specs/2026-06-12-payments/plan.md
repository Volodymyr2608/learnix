# Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. See `requirements.md` for FRs/scope, `spec.md` for the
> data model + flow, `validation.md` for checks, and `docs/adr/019-payments.md` for the decision.

**Goal:** Gate paid-course enrollment behind Stripe Checkout, take a flat platform commission,
and pay instructors their net via Stripe Connect Express — while free ($0) courses keep instant
enrollment.

**Architecture:** Platform is merchant of record (separate charge + Stripe `Transfer`). Layering
per ADR-003/004/010: `payment.repository` (extends `BaseRepository`) → `payment.service` +
`connect.service` (typed `DomainError`s) → `payment` router (student/instructor/admin
procedures). An idempotent `finalizeCheckout(sessionId)` is the single reconcile point, called by
both the webhook and the success-page query. "Allow sale, hold funds": unonboarded instructors
accrue a `pending` owed balance, swept on `account.updated`.

**Tech Stack:** Next.js 16 App Router, tRPC, Prisma (schema folder), Stripe Node SDK, Vitest,
Zod, Better Auth, `@t3-oss/env-nextjs`.

**Codebase anchors (verified):**
- `BaseRepository<TModel, TPayload, TCreate, TUpdate, TWhere, TInclude, TSelect, TOrderBy>`
  (`server/repositories/base/base.repository.ts`); extension convention in
  `server/repositories/enrollment.repository.ts`.
- `DomainError(message, code, cause?, context?)` (`server/services/base/base.errors.ts`);
  subclass pattern `export class EnrollmentError extends DomainError {}`.
- `studentProcedure` / `instructorProcedure` / `adminProcedure` (`server/api/trpc.ts`).
- `handleServiceError(error)` (`server/utils/handleServiceError.ts`; used in
  `server/api/routers/course.ts`).
- `enrollmentService.enrollInCourse(studentId, courseId)` to reuse — rejects own-course +
  handles re-activation (`server/services/enrollment/enrollment.service.ts`).
- Raw-body route pattern `app/api/notifications/log/route.ts`.
- Env shape `lib/env.js` (`server` schema + `runtimeEnv` mirror).
- `Course.price String` / `originalPrice String?` (`prisma/schema/course.prisma:15-16`);
  `InstructorProfile` (`prisma/schema/instructor.prisma`); `User` relations
  (`prisma/schema/auth.prisma:7-36`); course Zod entity `price: z.string()`
  (`server/entities/course/index.ts:50`); settings hub `app/_components/Account/SettingsShell`.

**Per-task conventions:** after the impl step, `pnpm typecheck` + `pnpm check` must be clean
before committing. Unit tests are colocated `*.test.ts` (no DB, Stripe mocked); integration tests
are `*.integration.test.ts` against `learnix_test`; services and repositories export singletons.

---

## Task 1: Dependencies & environment

**Files:**
- Modify: `package.json` (via `pnpm add`)
- Modify: `lib/env.js`
- Modify: `.env`, `.env.example`, `.env.test.example`
- Modify: `CLAUDE.md` (env table)

- [ ] **Step 1:** `pnpm add stripe`.
- [ ] **Step 2:** In `lib/env.js`, add to the `server` schema (after `UNSUBSCRIBE_SECRET`):

```js
STRIPE_SECRET_KEY: z.string().min(1),
STRIPE_WEBHOOK_SECRET: z.string().min(1),
STRIPE_PLATFORM_FEE_PERCENT: z.coerce.number().int().min(0).max(100).default(20),
```

and the matching `runtimeEnv` lines:

```js
STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
STRIPE_PLATFORM_FEE_PERCENT: process.env.STRIPE_PLATFORM_FEE_PERCENT,
```

- [ ] **Step 3:** Add the three keys to `.env`, `.env.example`, `.env.test.example` (test uses
  dummy values; `STRIPE_PLATFORM_FEE_PERCENT=20`). Add the rows to the CLAUDE.md env table.
- [ ] **Step 4:** Run `pnpm typecheck` → clean (env compiles).
- [ ] **Step 5:** Commit. `git commit -m "chore(payments): add stripe dep + STRIPE_* env vars"`

---

## Task 2: Prisma schema & data migration

**Files:**
- Create: `prisma/schema/payments.prisma`
- Modify: `prisma/schema/course.prisma`, `prisma/schema/instructor.prisma`, `prisma/schema/auth.prisma`
- Create: the generated migration SQL (hand-edited)

- [ ] **Step 1:** Create `prisma/schema/payments.prisma`:

```prisma
enum PaymentStatus  { pending succeeded failed refunded }
enum TransferStatus { none pending transferred reversed }

model Payment {
  id           String @id @default(cuid())
  studentId    String
  student      User   @relation("StudentPayments", fields: [studentId], references: [id], onDelete: Cascade)
  courseId     String
  course       Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
  instructorId String
  instructor   User   @relation("InstructorPayments", fields: [instructorId], references: [id], onDelete: Cascade)

  amountCents        Int           @map("amount_cents")
  currency           String        @default("usd")
  status             PaymentStatus @default(pending)

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

model ProcessedStripeEvent {
  id          String   @id
  type        String
  processedAt DateTime @default(now()) @map("processed_at")
  @@map("processed_stripe_events")
}
```

- [ ] **Step 2:** `course.prisma` — add `priceCents Int @default(0) @map("price_cents")`,
  `originalPriceCents Int? @map("original_price_cents")`, and `payments Payment[]`. Keep the old
  `price` / `originalPrice` columns for now (dropped in Step 5's hand-edited SQL).
- [ ] **Step 3:** `instructor.prisma` — add to `InstructorProfile`:

```prisma
stripeAccountId      String?   @unique @map("stripe_account_id")
stripeChargesEnabled Boolean   @default(false) @map("stripe_charges_enabled")
stripePayoutsEnabled Boolean   @default(false) @map("stripe_payouts_enabled")
stripeOnboardedAt    DateTime? @map("stripe_onboarded_at")
```

- [ ] **Step 4:** `auth.prisma` — add to `User`:
  `studentPayments Payment[] @relation("StudentPayments")` and
  `instructorPayments Payment[] @relation("InstructorPayments")`.
- [ ] **Step 5:** `pnpm db:generate` to scaffold the migration, then **hand-edit the migration
  SQL** so the backfill runs *before* the drop:

```sql
-- after the ADD COLUMN price_cents / original_price_cents lines, BEFORE any DROP COLUMN:
UPDATE "courses" SET "price_cents" = ROUND(CAST("price" AS DECIMAL) * 100);
UPDATE "courses" SET "original_price_cents" = ROUND(CAST("original_price" AS DECIMAL) * 100)
  WHERE "original_price" IS NOT NULL;
ALTER TABLE "courses" DROP COLUMN "price";
ALTER TABLE "courses" DROP COLUMN "original_price";
```

- [ ] **Step 6:** `pnpm db:migrate` then `pnpm generate`. `pnpm typecheck` (will now error at every
  `course.price` read — fixed in Task 6; expected).
- [ ] **Step 7:** Commit. `git commit -m "feat(payments): Payment/ProcessedStripeEvent schema, cents + connect fields, backfill migration"`

---

## Task 3: `lib/formatPrice.ts` (TDD)

**Files:** Create `lib/formatPrice.ts`; Test `lib/formatPrice.test.ts`

- [ ] **Step 1:** Write the failing test:

```ts
import { describe, expect, it } from "vitest";
import { formatPrice } from "./formatPrice";

describe("formatPrice", () => {
  it("renders 0 as Free", () => expect(formatPrice(0)).toBe("Free"));
  it("renders whole dollars", () => expect(formatPrice(4900)).toBe("$49.00"));
  it("renders cents", () => expect(formatPrice(4999)).toBe("$49.99"));
});
```

- [ ] **Step 2:** Run `pnpm vitest run lib/formatPrice.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement:

```ts
export function formatPrice(cents: number): string {
  if (cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4:** Run the test → PASS. `pnpm check` clean.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): formatPrice cents helper"`

---

## Task 4: `lib/platformFee.ts` (TDD)

**Files:** Create `lib/platformFee.ts`; Test `lib/platformFee.test.ts`

- [ ] **Step 1:** Failing test:

```ts
import { describe, expect, it } from "vitest";
import { computeSplit } from "./platformFee";

describe("computeSplit", () => {
  it("20% of 10000", () =>
    expect(computeSplit(10000, 20)).toEqual({ platformFeeCents: 2000, instructorNetCents: 8000 }));
  it("rounds the fee on odd amounts", () =>
    expect(computeSplit(9999, 20)).toEqual({ platformFeeCents: 2000, instructorNetCents: 7999 }));
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:

```ts
export function computeSplit(amountCents: number, feePercent: number) {
  const platformFeeCents = Math.round((amountCents * feePercent) / 100);
  return { platformFeeCents, instructorNetCents: amountCents - platformFeeCents };
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): computeSplit commission helper"`

---

## Task 5: `lib/connectStatus.ts` (TDD)

**Files:** Create `lib/connectStatus.ts`; Test `lib/connectStatus.test.ts`

- [ ] **Step 1:** Failing test covering each branch:

```ts
import { describe, expect, it } from "vitest";
import { deriveConnectStatus } from "./connectStatus";

const base = { details_submitted: false, payouts_enabled: false, requirements: { currently_due: [], past_due: [], disabled_reason: null } };

describe("deriveConnectStatus", () => {
  it("not_started", () => expect(deriveConnectStatus(null)).toBe("not_started"));
  it("restricted", () =>
    expect(deriveConnectStatus({ ...base, requirements: { ...base.requirements, disabled_reason: "rejected.fraud" } })).toBe("restricted"));
  it("action_required (due)", () =>
    expect(deriveConnectStatus({ ...base, details_submitted: true, requirements: { ...base.requirements, currently_due: ["external_account"] } })).toBe("action_required"));
  it("action_required (not submitted)", () => expect(deriveConnectStatus(base)).toBe("action_required"));
  it("pending_review", () => expect(deriveConnectStatus({ ...base, details_submitted: true })).toBe("pending_review"));
  it("verified", () => expect(deriveConnectStatus({ ...base, details_submitted: true, payouts_enabled: true })).toBe("verified"));
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `deriveConnectStatus(account)` + `export type ConnectStatus` (the
  five-value union) in the precedence order tested: `null` → `not_started`; `disabled_reason` →
  `restricted`; `currently_due`/`past_due` non-empty or `!details_submitted` → `action_required`;
  `payouts_enabled` → `verified`; else `pending_review`. Accept a minimal structural type so the
  real `Stripe.Account` satisfies it.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): deriveConnectStatus KYC mapping"`

---

## Task 6: Migrate price reads/writes to cents (restore green build)

**Files (modify):** `server/services/course/course.service.ts`,
`server/repositories/course.repository.ts`, `server/entities/course/index.ts`,
`app/.../BrowseCourseCard`, `app/.../CourseDetailEnrollCard`, instructor preview component,
`useCourseForm` + price input, AI course-builder price persistence.

- [ ] **Step 1:** `server/entities/course/index.ts:50` — change `price: z.string()...` to
  `priceCents: z.number().int().min(0)` and `originalPriceCents: z.number().int().min(0).optional()`;
  update the create/update pick lists (`:113`).
- [ ] **Step 2:** Replace every read: `Number(course.price)` / `course.price` → `course.priceCents`
  rendered through `formatPrice`. Replace discount-badge math with `priceCents`/`originalPriceCents`.
  Form inputs collect dollars and convert (`Math.round(dollars * 100)`) on submit; display divides
  by 100.
- [ ] **Step 3:** Update AI course-builder price persistence to write `priceCents`.
- [ ] **Step 4:** Audit: `grep -rn "\.price\b\|originalPrice" app server prisma/zod` → only intended
  `priceCents`/`originalPriceCents` remain.
- [ ] **Step 5:** `pnpm typecheck` + `pnpm check` clean; `pnpm test:unit` green.
- [ ] **Step 6:** Commit. `git commit -m "refactor(payments): course price String -> integer cents"`

---

## Task 7: Payment DTOs + typed errors

**Files:** Create `server/entities/payment.ts`, `server/services/payments/payment.errors.ts`

- [ ] **Step 1:** `payment.errors.ts`:

```ts
import { DomainError } from "@/server/services/base/base.errors";

export class PaymentError extends DomainError {}
export class CourseIsFreeError extends PaymentError {
  constructor(ctx?: Record<string, unknown>) { super("This course is free", "BAD_REQUEST", undefined, ctx); }
}
export class AlreadyEnrolledError extends PaymentError {
  constructor(ctx?: Record<string, unknown>) { super("You are already enrolled in this course", "CONFLICT", undefined, ctx); }
}
export class CourseNotPurchasableError extends PaymentError {
  constructor(ctx?: Record<string, unknown>) { super("Course not found or not purchasable", "NOT_FOUND", undefined, ctx); }
}
export class ConnectNotReadyError extends PaymentError {
  constructor(ctx?: Record<string, unknown>) { super("Stripe account is not ready", "BAD_REQUEST", undefined, ctx); }
}
```

- [ ] **Step 2:** `server/entities/payment.ts` — Zod DTOs for router inputs/outputs
  (`createCheckoutSessionInput = z.object({ courseId: z.string() })`, `connectStatusOutput`,
  `instructorEarningsOutput`, `platformRevenueOutput`).
- [ ] **Step 3:** `pnpm typecheck` clean.
- [ ] **Step 4:** Commit. `git commit -m "feat(payments): payment DTOs + typed domain errors"`

---

## Task 8: `payment.repository.ts` + integration tests

**Files:** Create `server/repositories/payment.repository.ts`,
`server/repositories/payment.repository.integration.test.ts`

- [ ] **Step 1:** Write the failing integration test: create student/instructor/course rows, insert
  payments, assert `findBySessionId`, `findByPaymentIntentId`, `getOwedBalance` (sum of
  `instructorNetCents` where `transferStatus = pending`), and `getPlatformRevenue` (sum of
  `platformFeeCents` where `status = succeeded` and not refunded).
- [ ] **Step 2:** Run `pnpm test:integration payment.repository` → FAIL (class missing).
- [ ] **Step 3:** Implement, mirroring `enrollment.repository.ts` generics:

```ts
import type { Payment, Prisma } from "@/generated/prisma";
import { BaseRepository } from "./base/base.repository";

class PaymentRepository extends BaseRepository<
  "payment", Payment,
  Prisma.PaymentUncheckedCreateInput, Prisma.PaymentUpdateInput,
  Prisma.PaymentWhereInput, Prisma.PaymentInclude,
  Prisma.PaymentSelect, Prisma.PaymentOrderByWithRelationInput
> {
  protected readonly modelName = "payment" as const;

  findBySessionId(stripeCheckoutSessionId: string) {
    return this.findFirst({ where: { stripeCheckoutSessionId } });
  }
  findByPaymentIntentId(stripePaymentIntentId: string) {
    return this.findFirst({ where: { stripePaymentIntentId } });
  }
  async getOwedBalance(instructorId: string) {
    const r = await this.aggregate({ where: { instructorId, transferStatus: "pending" }, _sum: { instructorNetCents: true } });
    return r._sum.instructorNetCents ?? 0;
  }
  async getPlatformRevenue() {
    const r = await this.aggregate({ where: { status: "succeeded", refundedAt: null }, _sum: { platformFeeCents: true } });
    return r._sum.platformFeeCents ?? 0;
  }
}
export const paymentRepository = new PaymentRepository();
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): payment repository + aggregations"`

---

## Task 9: Stripe client singleton

**Files:** Create `server/services/payments/stripe.client.ts`

- [ ] **Step 1:** Implement:

```ts
import Stripe from "stripe";
import { env } from "@/lib/env";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY);
```

- [ ] **Step 2:** `pnpm typecheck` clean.
- [ ] **Step 3:** Commit. `git commit -m "feat(payments): stripe SDK singleton"`

---

## Task 10: `connect.service.ts` + unit tests (Stripe mocked)

**Files:** Create `server/services/payments/connect.service.ts`,
`server/services/payments/connect.service.test.ts`

- [ ] **Step 1:** Failing unit tests (mock `./stripe.client` + the instructor-profile repo +
  `paymentRepository`): `getConnectStatus` maps a retrieved account via `deriveConnectStatus` and
  returns owed/lifetime balances; `transferToInstructor` creates a `Transfer` and flips the payment
  to `transferred` only when `stripePayoutsEnabled`, otherwise leaves it `pending`;
  `sweepPendingTransfers` transfers all `pending` payments for an enabled account; `reverseTransfer`
  calls `transferReversals.create`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: `createOnboardingLink` (`accounts.create({ type: "express" })` once,
  persist `stripeAccountId`, then `accountLinks.create({ type: "account_onboarding", refresh_url,
  return_url })` off `env.BASE_URL`); `createLoginLink` (`accounts.createLoginLink`);
  `getConnectStatus` (`accounts.retrieve` → `deriveConnectStatus` + balances from
  `paymentRepository`); `syncAccountStatus(account)` (update profile
  `stripeChargesEnabled`/`stripePayoutsEnabled`/`stripeOnboardedAt`); `transferToInstructor(payment)`
  / `sweepPendingTransfers(instructorId)` / `reverseTransfer(payment)`. Export `connectService`
  singleton.
- [ ] **Step 4:** Run → PASS; `pnpm check` clean.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): Stripe Connect service (onboarding, status, transfers, sweep)"`

---

## Task 11: `payment.service.ts` + unit & integration tests

**Files:** Create `server/services/payments/payment.service.ts`, `payment.service.test.ts`,
`payment.service.integration.test.ts`

- [ ] **Step 1 (unit, FAIL):** `createCheckoutSession` guard rails (FR5) — free →
  `CourseIsFreeError`; own course → rejected; already active/completed → `AlreadyEnrolledError`;
  unpublished/deleted → `CourseNotPurchasableError`. `finalizeCheckout` idempotency — second call on
  an already-`succeeded` session does not re-enroll/re-split/re-transfer. Mock Stripe + repos +
  `enrollmentService` + `connectService`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement:
  - `createCheckoutSession(studentId, courseId)` — load course (published, not deleted), run guard
    rails, create `Payment(pending)`, `stripe.checkout.sessions.create({ mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: course.priceCents, product_data: {
    name: course.title } }, quantity: 1 }], success_url:
    `${env.BASE_URL}/dashboard/checkout/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url:
    `${env.BASE_URL}/dashboard/courses/${courseId}`, client_reference_id: payment.id, metadata: {
    paymentId } })`, store `stripeCheckoutSessionId`, return `{ url }`.
  - `finalizeCheckout(sessionId)` — retrieve session; if `payment_status === "paid"` and the
    `Payment` is still `pending`: mark `succeeded` + `stripePaymentIntentId`, call
    `enrollmentService.enrollInCourse`, `computeSplit(amountCents, env.STRIPE_PLATFORM_FEE_PERCENT)`,
    persist the split, then `connectService.transferToInstructor(payment)`. Re-reads guard the
    idempotency. Returns the payment status.
  - `handleRefund(paymentIntentId)` — mark `refunded` + `refundedAt`, cancel the enrollment; if
    `transferStatus === "transferred"` → `connectService.reverseTransfer(payment)`; if `pending` →
    drop the owed (set `transferStatus`).
  - `getInstructorEarnings(instructorId)` — available(transferred)/pending(owed)/lifetime gross/fees,
    via `paymentRepository`.
- [ ] **Step 4:** Run unit → PASS. Write/run the integration test (FR4 single-enrollment-on-double-
  call, sweep, refund) against `learnix_test` with Stripe mocked → PASS.
- [ ] **Step 5:** Commit. `git commit -m "feat(payments): payment service (checkout, idempotent finalize, refund, earnings)"`

---

## Task 12: tRPC `payment` router

**Files:** Create `server/api/routers/payment.ts`; Modify `server/api/root.ts`

- [ ] **Step 1:** Implement the router — each procedure wraps the service in `try/catch` →
  `handleServiceError(error)` (pattern from `server/api/routers/course.ts`):
  - `studentProcedure`: `createCheckoutSession` (mutation), `getSessionStatus` (query →
    `finalizeCheckout`).
  - `instructorProcedure`: `createConnectOnboardingLink`, `createConnectLoginLink`,
    `getConnectStatus`, `getInstructorEarnings`.
  - `adminProcedure`: `getPlatformRevenue`.
  Instructor/student ids come from `ctx.session.user.id`, never from input.
- [ ] **Step 2:** Register `payment: paymentRouter` in `server/api/root.ts`.
- [ ] **Step 3:** `pnpm typecheck` clean.
- [ ] **Step 4:** Commit. `git commit -m "feat(payments): payment tRPC router"`

---

## Task 13: Stripe webhook route

**Files:** Create `app/api/stripe/webhook/route.ts`

- [ ] **Step 1:** Implement (Node runtime, raw body, signature verify, dedupe, dispatch):

```ts
import { env } from "@/lib/env";
import { stripe } from "@/server/services/payments/stripe.client";
// ...payment/connect services + processed-event repo

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }
  if (await processedStripeEventRepository.exists(event.id)) return Response.json({ ok: true });

  switch (event.type) {
    case "checkout.session.completed": /* finalizeCheckout(session.id) */ break;
    case "charge.refunded":            /* handleRefund(paymentIntentId) */ break;
    case "account.updated":            /* syncAccountStatus + sweep if newly enabled */ break;
  }
  await processedStripeEventRepository.record(event.id, event.type);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2:** Add a `processedStripeEvent.repository.ts` (`exists`, `record`) if not folded into
  `payment.repository`. `pnpm typecheck` clean.
- [ ] **Step 3:** Smoke via `stripe listen` (covered in `validation.md`). Commit.
  `git commit -m "feat(payments): stripe webhook (verify, dedupe, dispatch)"`

---

## Task 14: Buy-flow UI

**Files (modify):** `BrowseCourseCard`, `CourseDetailEnrollCard`, `EnrollConfirmDialog` / enroll CTAs

- [ ] **Step 1:** Branch on `priceCents`: `0` → keep the existing "Enroll Now" instant flow; `> 0` →
  render "Buy now — {formatPrice(priceCents)}", on click call
  `api.payment.createCheckoutSession.useMutation` then `window.location.href = url`.
- [ ] **Step 2:** `pnpm check` + `pnpm typecheck` clean; component tests if present green.
- [ ] **Step 3:** Commit. `git commit -m "feat(payments): buy-now CTA on paid courses"`

---

## Task 15: Checkout success page

**Files:** Create `app/dashboard/checkout/success/page.tsx`

- [ ] **Step 1:** Read `?session_id`, call `payment.getSessionStatus` (triggers idempotent
  `finalizeCheckout`), show a brief processing state then a confirmation with a "Start learning" link
  to the course learn page.
- [ ] **Step 2:** `pnpm typecheck` + `pnpm check` clean. Commit.
  `git commit -m "feat(payments): checkout success + reconcile page"`

---

## Task 16: Settings "Payouts & verification" card (instructor-only)

**Files:** Create the section under `app/_components/Account/SettingsShell` (component folder +
colocated `types.ts`, ADR-011)

- [ ] **Step 1:** Instructor-only card: KYC status badge from `payment.getConnectStatus`; primary
  button = "Set up payouts"/"Continue verification" (→ `createConnectOnboardingLink`) when not
  verified, or "Open Stripe dashboard" (→ `createConnectLoginLink`) when verified; earnings/owed
  balances from `getInstructorEarnings`.
- [ ] **Step 2:** `pnpm check` + `pnpm typecheck` clean. Commit.
  `git commit -m "feat(payments): instructor payouts & verification settings card"`

---

## Task 17: Admin platform-revenue surface

**Files (modify):** the admin view that should show platform revenue

- [ ] **Step 1:** Surface `payment.getPlatformRevenue` (sum of `platformFeeCents` over succeeded,
  non-refunded payments) in the admin area, formatted via `formatPrice`.
- [ ] **Step 2:** `pnpm typecheck` clean. Commit.
  `git commit -m "feat(payments): admin platform revenue"`

---

## Task 18: Docs

**Files (modify):** `CLAUDE.md` (Architecture + env), `docs/specs/roadmap.md`

- [ ] **Step 1:** Add a "Payments" subsection to CLAUDE.md Architecture (data flow, idempotent
  finalize, hold-funds/sweep). ADR-019 already exists — link it.
- [ ] **Step 2:** Mark **P0.2 — Payments & monetization** delivered in `docs/specs/roadmap.md`.
- [ ] **Step 3:** Commit. `git commit -m "docs(payments): architecture + roadmap update"`

---

## Self-review

- **Spec coverage:** FR1–FR2 → Task 14; FR3–FR4 → Task 11/15; FR5 → Task 11; FR6 → Task 13; FR7 →
  Task 11/13; FR8–FR10 → Task 11; FR11 → Task 10/13; FR12 → Task 1/11; FR13–FR17 → Task 16/10; FR18
  → Task 17. All mapped.
- **Placeholder scan:** no `TBD`/`TODO`/"handle edge cases" left in code steps.
- **Type consistency:** `computeSplit`, `finalizeCheckout`, `transferStatus`, `deriveConnectStatus`,
  `priceCents` used identically across tasks.

## Final verification (see `validation.md` for detail)

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` all green.
- Manual (Stripe test mode + `stripe listen`): onboard instructor → Verified badge; paid purchase
  with `4242…` → enrolled + `succeeded` + `Transfer` + revenue up; free course still instant; guard
  rails reject own/already-enrolled before any Stripe call; sale-before-onboarding holds funds then
  sweeps on onboarding; refund cancels enrollment + reverses transfer; webhook resend is idempotent;
  webhook-lag fallback finalizes via the success page.