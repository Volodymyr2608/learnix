# Validation: Student Billing (purchase history)

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean (notably: `api.billing.listPurchases` resolves to `StudentPurchase[]`; `InvoiceDocument` props match `billingService.renderInvoicePdf`).
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `server/services/billing/auth.test.ts` — `signInvoiceToken("pay-123")` then `verifyInvoiceToken(token)` round-trips `{ paymentId: "pay-123" }`; a tampered token (last 2 chars changed) rejects. (FR9)
- `app/api/invoices/[paymentId]/route.test.ts` — `GET` with **no** `token` query param → `401`; `GET` with a malformed `token=garbage` → `401`. (FR7)

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `server/repositories/payment.repository.integration.test.ts`
  - `findPurchasesByStudent` returns **only** `succeeded` + `refunded` rows for the given student (excludes `pending`, `failed`, and another student's payments), ordered `createdAt` **desc**, and hydrates `course.title` + `instructor.name`. (FR3, FR5, FR10)
  - `findInvoiceData` returns `course.title` + `student.{name,email}` for a real payment, and `null` for an unknown id. (FR8, FR7-404 path)
- `server/services/billing/billing.service.integration.test.ts`
  - `listPurchases` maps repository rows to `StudentPurchase` DTOs (`courseTitle`, `instructorName`, `amountCents`, `currency`, `status`, `paymentId`). (FR1, FR11, FR12)
  - `renderInvoicePdf` returns a `Buffer` whose first bytes are `%PDF-` for a real payment. (FR8)
  - `renderInvoicePdf` throws `InvoiceNotFoundError` for a missing payment id (→ maps to 404 in the route). (FR7, FR11)

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (list newest-first, course/instructor/amount/date/status) | `billing.service.integration` (listPurchases mapping) + Manual #1 |
| FR2 (Paid badge; Refunded badge + refunded date) | Manual #1 (Paid) + Manual #4 (Refunded badge & date) |
| FR3 (only `succeeded`+`refunded` queried) | `payment.repository.integration` (filter excludes pending/failed) |
| FR4 (empty state) | Manual #3 |
| FR5 (own purchases only; `studentProcedure`) | `payment.repository.integration` (excludes other student) + Manual #5 (IDOR) |
| FR6 (per-row Download invoice action) | Manual #2 |
| FR7 (route 200 / 401 / 404) | `route.test` (401 paths) + `billing.service.integration` (404 path) + Manual #2 (200) + Manual #5 (401 cross-payment) |
| FR8 (invoice contents from stored data) | `billing.service.integration` (PDF buffer) + Manual #2 (visual contents) |
| FR9 (`INVOICE_SECRET` isolation) | `auth.test` (round-trip + tamper) + Manual #6 (certificate token ≠ invoice token) |
| FR10 (single joined query, no N+1) | `payment.repository.integration` (one `findMany` with includes) |
| FR11 (service + typed errors) | `billing.service.integration` (mapping + `InvoiceNotFoundError`) |
| FR12 (`studentProcedure` + page mints token per row) | `pnpm typecheck` (router type) + Manual #1/#2 |

## Manual test scenarios

Prereqs:
```bash
# 1. Ensure INVOICE_SECRET is set in .env (non-empty).
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # app on http://localhost:3000
# 2. Seed at least one SUCCEEDED payment for a known student:
#    - Sign in as a student and buy a paid course via Stripe test checkout
#      (card 4242 4242 4242 4242), OR insert a Payment row with status=succeeded
#      via `pnpm db:studio`.
# 3. For the refund scenario, refund that charge in the Stripe test dashboard
#    (or set the row's status=refunded + refundedAt via db:studio).
```

1. **List renders purchases:** As the student with a succeeded payment, open `/dashboard/billing` (sidebar → **Billing**) → the page header "Billing" shows, and a card lists the bought course with instructor name, purchase date, formatted amount (e.g. `$49.99`), and a green **Paid** badge. Newest purchase appears first.
2. **Invoice download (200):** On a purchase row, click **Invoice** → a file `invoice-<paymentId>.pdf` downloads. Opening it shows the Learnix-branded header, "Billed to" with the student name + email, the course title, the total paid, the date, and the Invoice ID (= paymentId).
3. **Empty state:** Sign in as a student with **no** payments and open `/dashboard/billing` → the "No purchases yet" empty state with a **Browse courses** button (→ `/dashboard/browse`); no error, no empty table.
4. **Refunded purchase:** For a payment refunded in Stripe, reload `/dashboard/billing` → its row shows a red **Refunded** badge and a "Refunded <date>" line; the invoice PDF for that row shows the "REFUNDED" marker.
5. **IDOR / cross-payment (401):** Copy a valid invoice URL, then change the `paymentId` path segment to another student's payment id while keeping the same `token` → the route returns **401** (token is bound to the original paymentId). Also confirm a student never sees another student's purchase in the list.
6. **Token isolation:** Take a valid **certificate** download token and use it as `?token=` on `/api/invoices/<paymentId>` → **401** (verified with `INVOICE_SECRET`, not `CERTIFICATE_SECRET`).

## Edge cases & regression

- **Free enrollments:** a course enrolled at `priceCents: 0` creates no `Payment` row, so it correctly never appears on the billing page (verify: such a student with only free enrollments sees the empty state).
- **Missing token / expired token:** no `?token=` → 401; an expired (>30d) or signature-invalid token → 401 (caught by `verifyInvoiceToken`).
- **Unknown payment id with a self-consistent forged token:** impossible without `INVOICE_SECRET`; a valid token can only exist for a real `paymentId` the student was shown. A valid-looking token for a deleted payment → `renderInvoicePdf` throws `InvoiceNotFoundError` → 404.
- **Currency formatting:** amount renders via `Intl.NumberFormat` using the row's `currency`; a non-`usd` currency still formats with the correct symbol (no hard-coded `$`).
- **No regression to payments:** Billing is read-only — confirm the existing checkout/finalize/refund flows and `/instructor/revenue` are untouched (`pnpm test:integration` for payments stays green).
- **Nav link:** the pre-existing sidebar "Billing" link now resolves (no 404).

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check in the table above.
- [ ] All 6 manual scenarios pass.
- [ ] Risks in `spec.md` mitigated/accepted: `INVOICE_SECRET` validated in `lib/env.js` and present in all envs; token scoped to a single `paymentId` with 30d expiry; PDF rendered only on download; currency carried in the DTO.
- [ ] Docs updated: CLAUDE.md env table (`INVOICE_SECRET`) + Billing note added.