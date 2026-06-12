# Requirements: Payments (Paid Enrollment, Commission & Instructor Payouts)

> Design (data model, env, flow, file list) lives in [`spec.md`](./spec.md); the
> implementation plan in [`plan.md`](./plan.md); checks in [`validation.md`](./validation.md).

## Status: planned — roadmap P0.2

## Problem

Learnix cannot make money. Any authenticated student can enroll in any published
course **for free**: the "Enroll Now" button calls `course.enroll`
(`server/api/routers/course.ts`) → `EnrollmentService.enrollInCourse`
(`server/services/enrollment/enrollment.service.ts`) with **zero payment gating**.

`Course.price` / `originalPrice` exist but are stored as fragile `String`s
(`prisma/schema/course.prisma:15-16`), coerced with `Number()` at ~3 display
sites. There is no `Payment` record, no checkout, no webhook, no instructor
payouts, and no platform revenue.

The roadmap flags this as **P0.2 — Payments & monetization (Stripe)**
(`docs/specs/roadmap.md:147`).

## Goal

A complete course marketplace payment system:

- **Students pay** for paid courses through **Stripe Checkout** and get lifetime access; free ($0) courses keep instant enrollment.
- **The platform earns** a flat **per-sale commission** (default **20%**, configurable).
- **Instructors get paid** the remaining **80%** via **Stripe Connect (Express)**, which also runs their identity/KYC verification and bank payouts.
- A sale **never blocks on onboarding**: if the instructor hasn't connected yet, the student still buys and the instructor's net is **held** until they finish, then swept out automatically.

## Scope decisions (locked with stakeholder)

1. **Purchase model:** one-time **per-course** purchase → lifetime access. No subscriptions.
2. **Checkout UX:** **Stripe Checkout (hosted redirect page)**. No Stripe.js / Payment Element → **no publishable key**.
3. **Merchant of record:** the platform charges the student to **its own account** and moves the instructor's net with a **separate Stripe `Transfer`** — **not** a destination/connected-account charge. Required by decision #8 ("allow sale, hold funds"), which is impossible if the payment is split at checkout. Also makes refunds simple (refund the charge, reverse the transfer).
4. **Free courses (`priceCents = 0`):** keep the **existing instant free-enrollment** flow; never touch Stripe.
5. **Price storage:** migrate `Course.price` `String` → **integer cents** (`priceCents`). Stripe works in the smallest currency unit.
6. **Commission:** a single **flat %** for all instructors, default **20%**, via `STRIPE_PLATFORM_FEE_PERCENT`. (Tiered / per-course rates out of scope.) Stripe's processing fee is absorbed by the platform out of its cut (no passthrough).
7. **Payouts:** **Stripe Connect Express** — Stripe-hosted onboarding + dashboard + automatic bank payouts. **KYC is performed by Stripe**, not by us; the platform never collects or stores identity/bank data. An instructor receives payouts only after Stripe clears verification (`payouts_enabled = true`).
8. **Unonboarded/unverified instructor:** **allow the sale, hold the funds.** The student is charged; the instructor's net becomes a *pending* owed balance, swept to their connected account once the account is enabled.
9. **Refunds:** **webhook-driven**. Refunds are issued in the Stripe Dashboard; `charge.refunded` cancels the enrollment, marks the payment refunded, and reverses the transfer if it already went out. No in-app refund button.

### Assumptions

- Single currency **USD** (`amountCents`, `currency` default `"usd"`).
- The webhook handler runs on the **Node.js runtime** (not edge) — it needs the raw request body and the Stripe SDK.

## Functional requirements

### Purchase & access

| # | Surface | Behaviour |
|---|---------|-----------|
| FR1 | Course detail / browse card (paid) | Show **"Buy now — $X"** CTA instead of "Enroll Now"; click → Stripe Checkout. |
| FR2 | Course detail / browse card (free) | Keep existing instant **"Enroll Now"** flow; never touch Stripe. |
| FR3 | Checkout start | A `Payment` row is created `pending` (student + course + instructor + `amountCents`) **before** redirect; `stripeCheckoutSessionId` stored. |
| FR4 | Payment success | Student is enrolled by reusing `enrollInCourse`; payment marked `succeeded`. Enrollment + revenue counting are **idempotent** across the webhook and the success-page reconcile. |
| FR5 | Guard rails | Reject before any Stripe call when: course unpublished/soft-deleted, buyer is the course's own instructor, student already `active`/`completed`, or course is free. |
| FR6 | Webhook | `stripe-signature` verified with `STRIPE_WEBHOOK_SECRET`; events **de-duplicated** via `ProcessedStripeEvent`. |
| FR7 | Refund | `charge.refunded` → mark `Payment` `refunded` (+ `refundedAt`), cancel the enrollment, and (if already transferred) reverse the transfer. |

### Commission & payouts

| # | Surface | Behaviour |
|---|---------|-----------|
| FR8 | Sale finalize | On a `succeeded` payment, compute `platformFeeCents = round(amount * feePercent/100)` and `instructorNetCents = amount − platformFeeCents`; persist both on the `Payment`. |
| FR9 | Transfer (onboarded) | If the instructor's connected account can receive funds, create a Stripe `Transfer` of `instructorNetCents` to it and mark the payment `transferred`. |
| FR10 | Transfer (held) | If not yet onboarded/verified, leave the payment `pending` (owed). No money moves to the instructor yet. |
| FR11 | Onboarding sweep | When `account.updated` reports the account newly enabled, transfer **all** `pending` payments for that instructor and mark them `transferred`. |
| FR12 | Configurable rate | Rate from `STRIPE_PLATFORM_FEE_PERCENT` (default 20); changing it affects only **future** sales. |

### Instructor Connect / settings

| # | Surface | Behaviour |
|---|---------|-----------|
| FR13 | Settings → Payouts section | An instructor-only **"Payouts & verification"** card in account settings is the single home for Connect: KYC status badge, the relevant action button, and the owed/lifetime balances. |
| FR14 | Start / continue KYC | When there is **no** connected account or onboarding is **incomplete**, show **"Set up payouts"** / **"Continue verification"** → an `account_onboarding` account link (the same endpoint **starts and resumes** KYC). |
| FR15 | Stripe portal (dashboard) | Once onboarded, show **"Open Stripe dashboard"** → a one-time **Express login link** (`accounts.createLoginLink`) to manage payouts/bank details/verification in Stripe. |
| FR16 | KYC status display | Derived status badge — **Not started** (no account) · **Action required** (`requirements.currently_due`/`past_due`, or `details_submitted = false`) · **Pending review** (submitted, `payouts_enabled = false`, nothing currently due) · **Verified** (`payouts_enabled = true`) · **Restricted** (`requirements.disabled_reason`). Read live from Stripe. |
| FR17 | Instructor earnings | Same card: **available/transferred**, **pending (owed)**, **lifetime gross**, **platform fees paid**. |

### Admin

| # | Surface | Behaviour |
|---|---------|-----------|
| FR18 | Platform revenue | Admin view: total platform commission = sum of `platformFeeCents` over `succeeded` (non-refunded) payments. |

## Out of scope (deferred)

- Subscriptions / all-access plans.
- Tiered / per-course commission rates; fee passthrough; instructor subscriptions; featured-listing fees.
- In-app refund button; coupons / discount codes; multi-currency; tax / 1099 reporting.
- Manual payout scheduling (Express handles automatic payouts); embedded Payment Element.