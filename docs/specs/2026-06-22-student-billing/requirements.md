# Requirements: Student Billing (purchase history)

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — follows P0.2 (Payments & monetization, delivered)

Date: 2026-06-22 · Author: Volodymyr Pelykh · Stakeholders: product owner (self)

## Problem

The student dashboard sidebar already renders a **"Billing"** nav item linking to
`/dashboard/billing` (`lib/constants/urls/studentsUrls.ts` → `STUDENT_URLS.billing`, used in
`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:113`), but **no page exists at
that route** — it is a dead link.

Every paid enrollment is recorded in the `Payment` model (`studentId`, `courseId`, `amountCents`,
`currency`, `status`, `refundedAt`, `createdAt` — `prisma/schema/payments.prisma`), yet that data is
never surfaced back to the buyer. A student has **no in-app record of what they paid for, when, how
much, or whether a charge was refunded**, and no way to obtain an invoice. The payment repository
(`server/repositories/payment.repository.ts`) has instructor- and platform-scoped aggregates only —
there is no student-scoped purchase query.

## Goal

- A student can see every course purchase they have made, with amount, date, and status, at
  `/dashboard/billing`.
- A student can download a branded PDF invoice for any of their purchases.
- Refunded purchases are clearly distinguished from active ones.
- The existing "Billing" nav link resolves to a real page.

## Scope decisions (locked)

1. **Audience = student purchase history:** the page serves the buyer. The instructor earnings/payout
   side already exists at `/instructor/revenue` and is out of scope — rules out any instructor view here.
2. **Receipts = self-generated PDF invoice:** Learnix mints its own branded invoice PDF, mirroring the
   existing certificate flow (signed token + `GET /api/.../[id]?token=…` route + server-rendered PDF).
   No Stripe-hosted `receipt_url` is captured today, so we do not link out to Stripe.
3. **Invoice source data = the `Payment` record + course + student name/email:** no billing address,
   tax id, or `receipt_url` is collected at checkout, so the invoice is built only from data we already
   store. Rules out address/tax fields on the invoice.
4. **Refunds = display only:** refunded purchases show a "Refunded" badge and refunded date. Students
   **cannot initiate refunds** from this page — rules out any refund mutation/eligibility logic here.
5. **Visible statuses = `succeeded` + `refunded` only:** `pending` and `failed` payment attempts are
   not shown — they carry no lasting meaning to the buyer and would clutter the list.
6. **Separate `INVOICE_SECRET`:** invoice download tokens are signed with a new dedicated secret, not
   reused from `CERTIFICATE_SECRET`, to keep token scopes isolated.

## Assumptions & constraints

- Single currency in practice (`usd` default on `Payment.currency`); amounts are stored in cents and
  formatted for display — never recomputed client-side.
- Free enrollments do **not** create a `Payment` row, so they legitimately never appear on this page.
- A student's name and email are available on the `User` record for the invoice header.
- Must reuse the established certificate token + PDF-route pattern (`server/services/notifications/auth.ts`
  signing helpers, `app/api/certificates/[enrollmentId]/route.ts`) rather than inventing a new one.
- Must follow the three-layer pattern (router → service → repository) and the component conventions
  (colocated `types.ts`, no nested ternaries, flattened loading states).

## Functional requirements

### Billing list page

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | `/dashboard/billing` (student RSC) | Renders the authenticated student's purchases, **newest first**. Each row shows: course title, instructor name, amount (formatted from `amountCents` + `currency`, e.g. `$49.00`), purchase date, and a status badge. |
| FR2 | Status badge | A `succeeded` payment shows **"Paid"**. A `refunded` payment shows **"Refunded"** plus the refunded date (`refundedAt`). No other statuses are rendered. |
| FR3 | Status filtering | Only payments with status `succeeded` or `refunded` are listed; `pending` and `failed` rows are excluded from the query/result. |
| FR4 | Empty state | When the student has no qualifying purchases, the page shows a friendly empty state (e.g. "No purchases yet") with a path back to browsing courses — not a blank page or error. |
| FR5 | Access control | Only the signed-in student's own purchases are returned. Given another student's payment id, When the page loads, Then it never appears. Procedure is a `studentProcedure`. |

### Invoice download

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR6 | "Download invoice" action (per row) | Each listed purchase exposes a download action that resolves to a signed-token invoice URL for that `paymentId`. |
| FR7 | `GET /api/invoices/[paymentId]?token=…` | Given a valid token bound to the `paymentId`, Then returns **200** with `Content-Type: application/pdf` and an attachment disposition. Given a missing/invalid/mismatched token, Then returns **401**. Given a valid token for a non-existent payment, Then returns **404**. |
| FR8 | Invoice contents | The PDF includes: a Learnix-branded header, an invoice/identifier and date, the student's name/email, the course title, the amount paid, and the payment status (incl. a "REFUNDED" marker when applicable). It is generated from stored `Payment` + course + user data only. |
| FR9 | Token isolation | Invoice tokens are signed/verified with `INVOICE_SECRET` (distinct from `CERTIFICATE_SECRET`); a certificate token must not validate as an invoice token and vice versa. |

### Data & API

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | `payment.repository` | A new student-scoped query returns the caller's `succeeded` + `refunded` payments joined to course (title) and instructor (name), ordered newest first, in a single query (no N+1 per row). |
| FR11 | Billing/invoice service | A service method exposes the student purchase list for the page, and a separate method renders the invoice PDF for a given `paymentId` (enforcing ownership). Each service has its companion `.errors.ts` typed errors where needed (e.g. invoice-not-found). |
| FR12 | tRPC | A `studentProcedure` returns the current student's purchase list for FR1; the page consumes it via the RSC `api` caller, minting an invoice token per row server-side (mirroring the certificates page). |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Student-scoped data only; the invoice route authorizes via a token bound to `paymentId`, verified with `INVOICE_SECRET`. No payment of another user is ever listed or downloadable. No card/PAN data is touched (PCI out of band — handled by Stripe). |
| Performance | List renders from a single joined query (FR10); invoice PDF generated on demand per request. |
| Reliability | Invoice route returns deterministic status codes (200/401/404); a render failure for one invoice never affects the list page. |
| Accessibility / UX | Status badges have text labels (not color-only); download action is keyboard-reachable; amounts and dates use a consistent, localized-ish format. |
| Observability | Invoice-route failures (bad token, render error) are logged; no sensitive token contents logged. |
| Data / privacy | No new PII collected. Invoice uses only already-stored name/email/course/amount. No billing address or tax data is stored or shown. |

## Success metrics

- The "Billing" nav link resolves to a working page (0 dead-link reports).
- Students can self-serve an invoice for any purchase without contacting support.
- Refunded purchases are unambiguously distinguishable from active ones on the page.

## Out of scope (deferred)

- Student-initiated refunds or refund-eligibility logic.
- Saved/stored payment methods or card management.
- Billing address, VAT/tax id, or company details on the invoice.
- Stripe-hosted receipt links (`charge.receipt_url`).
- Any instructor-facing earnings/payout view (already at `/instructor/revenue`).
- Surfacing `pending`/`failed` payment attempts.
- Persisted invoice records or sequential invoice numbering beyond the `paymentId`-derived identifier.

## Open questions

- None blocking. (Statuses, receipt mechanism, refund behaviour, and the dedicated `INVOICE_SECRET`
  were all resolved during requirements gathering — see Scope decisions #2–#6.)