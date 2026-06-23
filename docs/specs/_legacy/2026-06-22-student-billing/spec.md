# Spec: Student Billing (purchase history)

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Student Billing is a **read-only view over the existing `Payment` ledger** plus an on-demand PDF
invoice — no schema changes. We mirror the certificates feature end-to-end: a `studentProcedure`
returns the caller's purchases for an RSC page (`/dashboard/billing`), and each row links to a
signed-token PDF route (`GET /api/invoices/[paymentId]?token=…`) that renders a react-pdf document.
The single new piece of design is an **invoice token** signed with a dedicated `INVOICE_SECRET`
(scope decision #6), structurally identical to `signCertificateToken` but isolated so a certificate
token can never authorize an invoice download. We reject reusing the certificate token (shared scope =
cross-feature authorization leak) and reject capturing Stripe `receipt_url` (not stored today; would
require checkout/webhook changes outside this feature's scope). The list query is a single joined read
filtered to `succeeded` + `refunded` (decision #5), so there is no N+1 and no client-side money math.

## Architectural decisions referenced

- **ADR-019 (merchant of record / payments)** — the `Payment` row is the source of truth for a sale;
  Billing only reads it (`amountCents`, `currency`, `status`, `refundedAt`, `createdAt`). It never
  recomputes amounts or touches Stripe.
- **Three-layer pattern (router → service → repository)** — new student purchase query lives in
  `payment.repository`; business logic + PDF rendering + ownership checks in a new `billing` service;
  transport in a new `billing` router. Mirrors `certificate.*`.
- **Certificate token + react-pdf pattern** (`server/services/notifications/auth.ts`,
  `app/api/certificates/[enrollmentId]/route.ts`, `app/_components/Certificate/`) — the invoice token,
  PDF route, and document component follow this established shape one-for-one.
- **Component conventions** — colocated `types.ts`, no nested ternaries, flattened loading states,
  sub-components own their layout.

## Data model

**No schema changes.** Billing reads the existing `Payment` model
(`prisma/schema/payments.prisma`) and joins `Course` (title) and `User` (instructor name; student
name/email for the invoice header). The set of "purchases" is defined by the query filter, not a new
column:

```prisma
// Existing Payment — read-only here. Relevant fields:
//   studentId, courseId, instructorId,
//   amountCents, currency, status (PaymentStatus), refundedAt, createdAt
// Filter for this feature: status IN (succeeded, refunded), studentId = caller
```

There is **no persisted invoice record and no sequential invoice number** (out of scope) — the
invoice identifier is derived from `payment.id`.

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `billing.listPurchases` | `studentProcedure` | `void` → `StudentPurchase[]` | Caller-scoped; newest first; `succeeded` + `refunded` only. Read-only. |
| `GET /api/invoices/[paymentId]` | HTTP route + `?token=` (HS256, `INVOICE_SECRET`) | `paymentId` + `token` → `200` PDF \| `401` \| `404` | Token must be bound to `paymentId`; payment must exist. Returns `application/pdf` attachment. |

`StudentPurchase` DTO (`server/entities/billing/purchase.ts`):

```ts
type StudentPurchase = {
  paymentId: string;
  courseId: string;
  courseTitle: string;
  instructorName: string;
  amountCents: number;
  currency: string;          // e.g. "usd"
  status: "succeeded" | "refunded";
  purchasedAt: Date;         // payment.createdAt
  refundedAt: Date | null;   // present when status === "refunded"
};
```

The page mints an invoice token per row server-side (mirroring the certificates page) and builds
`downloadUrl = ${BASE_URL}/api/invoices/${paymentId}?token=${token}`.

## Component / data flow

```
LIST (happy path)
  /dashboard/billing (RSC)
    └─ api.billing.listPurchases()                 [studentProcedure → service → repo]
         repo: db.payment.findMany({ studentId, status IN (succeeded,refunded) }, include course+instructor, orderBy createdAt desc)
    └─ for each row: signInvoiceToken(paymentId)   [INVOICE_SECRET]
    └─ render: rows.length === 0 ? <BillingEmptyState/> : <BillingHistoryList items/>

INVOICE DOWNLOAD
  click "Download invoice"  →  GET /api/invoices/[paymentId]?token=…
    ├─ no/invalid/mismatched token ........................ 401
    ├─ verifyInvoiceToken(token).paymentId !== paymentId .. 401
    ├─ billingService.renderInvoicePdf(paymentId)
    │     payment = repo.findInvoiceData(paymentId)
    │       ├─ not found ................................... throw InvoiceNotFoundError → 404
    │       └─ found → react-pdf renderToBuffer(InvoiceDocument)
    └─ 200 application/pdf (attachment; filename invoice-<paymentId>.pdf)
```

Ownership note: the token is the capability — it is minted only inside `listPurchases` (already
student-scoped), so a student can only ever hold tokens for their own payments. The route verifies
the token binds to the requested `paymentId`; it does not need a session (same model as certificates).

## File list

**New**
- `server/services/billing/auth.ts` — `signInvoiceToken(paymentId)` / `verifyInvoiceToken(token)` using `INVOICE_SECRET` (jose HS256, 30d), mirroring `notifications/auth.ts`.
- `server/services/billing/billing.service.ts` — `listPurchases(studentId)` (maps rows → `StudentPurchase[]`) and `renderInvoicePdf(paymentId)` (loads invoice data, throws `InvoiceNotFoundError`, returns `Buffer`).
- `server/services/billing/billing.errors.ts` — `InvoiceNotFoundError extends DomainError("NOT_FOUND")`.
- `server/entities/billing/purchase.ts` — `StudentPurchase` type (+ any invoice-data type).
- `server/api/routers/billing.ts` — `billingRouter` with `listPurchases: studentProcedure`.
- `app/api/invoices/[paymentId]/route.ts` — `GET` handler: verify token, render PDF, map errors to 401/404.
- `app/_components/Invoice/index.tsx` — `InvoiceDocument` (react-pdf `Document`/`Page`), mirroring `Certificate`.
- `app/_components/Invoice/components/*` — `InvoiceHeader` (Learnix brand), `InvoiceBody` (student, course, amount), `InvoiceFooter` (id, date, REFUNDED marker).
- `app/_components/Invoice/styles.ts`, `app/_components/Invoice/types.ts` — react-pdf styles + props.
- `app/_components/Billing/components/BillingHistoryList/{index.tsx,types.ts}` — table/list of purchase rows + status badge + download action.
- `app/_components/Billing/components/BillingEmptyState/{index.tsx,types.ts}` — "No purchases yet" + browse CTA.
- `app/dashboard/billing/page.tsx` — RSC: calls `listPurchases`, mints tokens, renders list or empty state.

**Modified**
- `server/repositories/payment.repository.ts` — add `findPurchasesByStudent(studentId)` (joined, filtered, ordered) and `findInvoiceData(paymentId)` (single payment + course + student for the PDF).
- `server/api/root.ts` — register `billing: billingRouter`.
- `lib/env.js` — add `INVOICE_SECRET: z.string().min(1)` to `server` schema + `runtimeEnv` mapping.

## Cross-cutting concerns

- **Security / authz (NFR):** `listPurchases` is a `studentProcedure` filtered to `ctx.session.user.id`
  — no IDOR. The invoice route authorizes via an HS256 token bound to `paymentId`; mismatched or
  foreign tokens → 401. `INVOICE_SECRET` is distinct from `CERTIFICATE_SECRET`, so token scopes can't
  cross. No card/PAN data is touched.
- **Error handling:** `InvoiceNotFoundError` (typed `DomainError`) → 404 in the route; token failures →
  401; the `studentProcedure` returns `[]` (not an error) for no purchases. UI uses flattened guards.
- **Idempotency / consistency:** read-only — no writes, no dedupe needed. Money is read from stored
  `amountCents`/`currency` and only *formatted* for display (`Intl.NumberFormat`), never recomputed.
- **Observability:** invoice-route failures (bad token, render error) are logged via the existing
  logger without logging token contents.
- **Performance:** list is one `findMany` with `include` (course + instructor) — no N+1; existing
  `@@index([studentId])` on `payments` covers the filter. Invoice PDF is rendered on demand per request.

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| `INVOICE_SECRET` missing in an env (build/prod) | M / build fails | Validated in `lib/env.js`; document in CLAUDE.md env table; add to `.env`/CI like other secrets. |
| Invoice token reused/leaked (URL sharing) | L / a shared link downloads one invoice for 30d | Scope is a single `paymentId`; short-ish 30d expiry matching certificates; can shorten later if needed. |
| react-pdf render cost on large lists | L / per-click only, not per-list | PDF is generated only on the download request, never during list render. |
| Currency assumed USD in formatting | L / wrong symbol if multi-currency later | DTO carries `currency`; UI uses `Intl.NumberFormat(undefined,{style:'currency',currency})`, so it already adapts. |

## Rollout / migration

- **Env:** add `INVOICE_SECRET` (server-only, `z.string().min(1)`) to `lib/env.js` and to local/CI/prod
  environments before deploy. No DB migration.
- **No backfill** — operates on existing `Payment` rows immediately.
- **Docs:** add `INVOICE_SECRET` to the CLAUDE.md env table and document the Billing page + invoice
  route alongside the certificates section.
- **Undo:** purely additive (new router/route/page/secret); removing the nav link already present and
  the new files fully reverts it.