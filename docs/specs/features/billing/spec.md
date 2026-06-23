---
feature: billing
status: stable
models: [Payment]
depends-on: [payments]
---

## Purpose

Students who paid for a course need a downloadable invoice/receipt for their own records (expenses,
reimbursement) without contacting support.

## Functional scope

- `billing.listPurchases` (studentProcedure) returns the caller's `succeeded` + `refunded` payments.
- `/dashboard/billing` (RSC) renders them and mints a `signInvoiceToken` per row server-side, linking
  to `GET /api/invoices/[paymentId]?token=…` (200 PDF / 401 bad token / 404 unknown payment).
- Invoice PDFs render via `@react-pdf/renderer` (`app/_components/Invoice/`), mirroring the
  certificate download flow's shape (mint-on-render, signed token, dedicated route).
- Tokens use `INVOICE_SECRET`, a separate signing secret from `CERTIFICATE_SECRET` — the two token
  types are not interchangeable even though the route shape is the same.

## Acceptance criteria

- A student can download an invoice for any of their own `succeeded` or `refunded` payments, and only
  their own.
- A refunded payment still produces a viewable invoice (it's not deleted/hidden on refund).
- An invoice token minted for one payment is rejected by the route for any other `paymentId`.

## Agent notes

- No schema changes — reuses the existing `Payment` model from the [[payments]] feature; this spec
  only covers the read/download surface, not checkout or payouts.
- Same token-minted-server-side, never-in-tRPC-response pattern as certificates — keep that invariant
  if this flow is extended (e.g. emailing the invoice).