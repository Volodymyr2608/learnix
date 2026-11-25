# Refund self-service — Slice 7: student UI and `/pricing` — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session (ADR-030).
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Earlier slices: [`plan.md`](plan.md) … [`plan-slice-6.md`](plan-slice-6.md).

**Goal:** A student sees, on the Purchases page and on a refund page per purchase, whether and how
they can ask for a refund, can request it, and sees its outcome; `/pricing` states the new policy
(FR-S1–S12, S19–S21, FR-P21).

**Architecture:** The server decides every state; the UI only renders it. Two pure functions over
the facts the request path already gathers — `purchaseRefundRowState` (the Purchases row) and
`refundPageState` (the refund page) — cover every Branch B state and are unit-tested. A new read,
`refund.getForPayment`, loads the facts for the session's own payment in one authorizing query
(C1), behind the same server-side flag as the request (C24), and returns a DTO that never carries
Stripe's text (C23). `billing.listPurchases` carries the row state, batched, without N+1. The UI
lives in `app/_components/Billing/**` (so the component-convention contract test scans it), each
sub-component in its own folder, the request mutation inside the form that owns the button.

**Spec:** [`../spec.md`](../spec.md) FR-S1–S12, S19–S21, FR-P21, User flow → Student (main flow,
Branch B, Branch C page text); AC-F1, F2 (UI half), F4 (UI half), F5 (naming half), F19, F21 (two
rows), F23 (page text), F24; [`../security.md`](../security.md) C1, C22, C23, C24.

**Track:** `pnpm classify` → **guarded** (branch-wide). New authority in this slice: one new
`studentProcedure` (`refund.getForPayment`) reading a student's payment and refund state, and new
fields on `billing.listPurchases`. No AI surface (no model call, prompt or tool). `/qa`:
`security-auditor` only; `llm-security-auditor` not needed (one line at `/qa`).

### Scope of this slice

**In:** the Purchases row (action, tooltip, status, nothing); the refund page for every state; the
request form; the outcome views (refunded, processing, denied); the status read; the two student
emails on the request path (automatic refund done, automatic denial); `/pricing` policy text; the
course page and purchase dialog dropping the old "30-day money-back" promise when the flag is on;
the request-endpoint limiter carried from slice 1 (U9).

**Out:** the "Ask an admin to review" action and the appeal form, "Under review" (slice 8, FR-S13
button, S15–S18); the checkout repurchase warning (FR-S23, slice 9); the remaining student emails
(appeal decided → slice 8; duplicate charge, failed at the bank → slice 9; lost dispute → slice 8
with the admin emails); a partial-refund remainder (no partial amount is stored; FR-P16, slice 9).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| U1 | The state logic is two pure functions in `server/services/refund/refundView.ts`: `purchaseRefundRowState(rowFacts, now)` and `refundPageState(pageFacts, now)`, returning discriminated unions; UI components switch on `kind` | One place decides; every Branch B state unit-tested without a DB; the UI cannot drift from the rules | Where the states are computed |
| U2 | Row precedence: existing request → its status; else dispute open, certificate, earlier counting refund, window closed → nothing; else (threshold or account limit possibly exceeded) → "Request a refund". The row never computes opened lessons or the account limit | FR-S1 shows the action even when those two are exceeded (they lead to FR-S13); skipping them keeps the list query cheap | Row cost |
| U3 | Page precedence: request exists → its status view; dispute → FR-S11 text; certificate → FR-S9 reason; earlier counting refund → "already refunded once"; window closed → FR-S8 with the date; threshold/account limit exceeded → the condition and its numbers (U4); else the form | A request's own status outranks today's facts; the dispute is checked before the others because it is decided at the bank | Order when several hold |
| U4 | In this slice the over-threshold / over-limit page names the condition and numbers ("you opened 4 lessons; the limit for this course is 3") but has **no** appeal button yet; slice 8 adds "Ask an admin to review" | The appeal endpoint does not exist until slice 8; the flag stays off until both ship (Release checklist) | AC-F5 split across slices |
| U5 | New read `refund.getForPayment({ paymentId })` (`studentProcedure`, `.strict()` input). Flag off, not the caller's payment, or not `succeeded`/`refunded` → the same `RefundNotFoundError` (NOT_FOUND). Ownership is in the `where` of the one query that loads the payment and its request (ADR-017 Rule 2) | C1, C24: indistinguishable "not found" | Status endpoint shape |
| U6 | The read DTO is an explicit mapping, never a spread of the row: no `refundError`, `stripeRefundId`, `stripePaymentIntentId`, snapshot internals beyond the numbers U4 shows; a key-path test pins it | C23: Stripe's text reaches only the admin | — |
| U7 | `billing.listPurchases` gains `refund: PurchaseRefundRowState | null` per row — `null` when the flag is off, so the row is unchanged; facts come from the payment query plus one batched enrollment read (certificates) and one batched counting-refund read, never one query per row | AC-F1 row; no N+1 | List shape |
| U8 | The request form uses local state (as `ReviewForm`), not react-hook-form: one radio group and one optional textarea; the closed list and the 2000-char cap come from `refundRequestInput`. After the mutation the page re-reads the server state (`router.refresh()`), so the shown outcome is always the server's | Two fields; the outcome views are the server's, not the mutation result's | — |
| U9 | Close the slice-1 accepted item now: a per-student limiter before the request transaction (the `checkAiRateLimit` pattern) and `SET LOCAL lock_timeout` inside it, mapped to a typed "try again" error | This slice gives the endpoint a button; the item is a Release-checklist blocker (`security.md` "Accepted for slice 1 only") | — (scope pulled forward) |
| U10 | Two student emails: "refund done" sent from the refund effects once, when the payment moves to `refunded` on path `refund_request` (synchronously or later by webhook/job); "automatic denial" sent after the denying transaction commits. Both via `sendOnce` with a dedup key per request, strict payloads (name, course title, amount or condition — no free text), skipped for anonymised accounts | AC-F21 for the two rows; a refund that completes later still emails once | When "refund done" fires |
| U11 | `/pricing` and the course page are flag-driven: flag on → the new policy (FR-P21) on `/pricing` with an anchor `#refund-policy` the tooltip links to, and no refund element on the course card or purchase dialog (UI-1); flag off → today's text unchanged | FR-P21 ships on Day 14 with the button; before that the old promise (Dashboard refunds) is still the policy | Text before flag-on |
| U12 | The refund page shows the student's submitted reason and text in the status view as plain React text; a contract test forbids `dangerouslySetInnerHTML` under `app/_components/Billing/` | AC-C22 student half | — |
| U13 | Touching `BillingHistoryList` splits it per the conventions: `PurchaseRow`, `StatusBadge`, `RefundRowAction` each in a folder with `types.ts`, arrow functions, formatters in `utils.ts` | CLAUDE.md "one component per folder"; the file has two `function` sub-components today | — |

Each is logged in `discovery/ai-decision-log.md` in Task 9.

**Codebase anchors (verified during planning):**
- Request path: `refundRouter.request` (`server/api/routers/refund.ts:8-16`, only procedure);
  `refundService.requestRefund` (`server/services/refund/refund.service.ts:48-151`, flag check `:52`,
  ownership via `findRequestablePayment` `:60-65`, facts `:76-102`, dispute `:113-114`, result
  `RefundRequestResult` `:24-30`); errors `RefundNotFoundError`, `RefundAlreadyRequestedError`
  (`server/services/refund/refund.errors.ts:4-18`).
- Input/types: `refundRequestInput` (`server/entities/refund/refund.dto.ts:45-57`), `RefundFacts`
  (`:17-27`), `RefundSnapshot` (`:30-36`), `REFUND_CONDITIONS` (`:5-12`).
- Rules: `refundThreshold`, `isInsideRefundWindow`, `decideRefund`, `REFUND_WINDOW_MS`,
  `ACCOUNT_LIMIT`, `accountLimitSince` (`server/services/refund/refundRules.ts:9-58`).
- Fact readers (take a `TransactionClient`): `findRequestablePayment` `:34`, `hasCertificate` `:65`,
  `hasCountingRefund` `:80`, `countAccountLimitRefunds` `:100`
  (`server/repositories/refundRequest.repository.ts`); `openedLessonRepository.countCourseLessons`
  (`server/repositories/openedLesson.repository.ts:29`).
- Models: `RefundRequest` (`prisma/schema/refund.prisma:24-50`; `refundState` null for a denial,
  `refundError` admin-only); `Payment` (`prisma/schema/payments.prisma:38-76`; `paidAt`,
  `disputeState`, `refundSource`, `amountCents`, `currency`; no partial amount).
- Flag: `isStudentRefundEnabled()` (`server/services/refund/refundFlag.ts:10-11`); tests mock it
  (`server/api/routers/refund.integration.test.ts:12-14`).
- Billing: page `app/dashboard/billing/page.tsx:10-41` (`api.billing.listPurchases()`);
  `billing.listPurchases` (`server/api/routers/billing.ts:6`); `billingService.listPurchases`
  (`server/services/billing/billing.service.ts:9-22`); `findPurchasesByStudent`
  (`server/repositories/payment.repository.ts:214-223`); `StudentPurchase`
  (`server/entities/billing/purchase.ts:1-11`); row UI
  `app/_components/Billing/components/BillingHistoryList/index.tsx` (+ `types.ts`).
- UI primitives: `Tooltip*` (`app/_components/_shared/ui/tooltip.tsx:61`), usage
  `app/_components/Messaging/MessageInstructorButton/index.tsx:32-46`; page pattern
  `app/dashboard/courses/[courseId]/review/page.tsx:6-25` + `components/ReviewForm`.
- Old promise: `app/(marketing)/pricing/page.tsx:82-86`;
  `app/_components/Course/components/BrowseCourse/CourseDetailEnrollCard/index.tsx:141`;
  `app/_components/Course/components/PurchaseConfirmDialog/index.tsx:82`.
- Emails: registry `server/services/email/email.templates.ts` (refund entries from `:139`,
  `refund.still-processing` `:170-176` is the shape); sender pattern
  `adminAlertService.refundOverdue` (`server/services/payments/adminAlert.service.ts:116-147`,
  `sendOnce`, anonymised skip `:135`); templates `app/_emails/RefundStillProcessingEmail/`.
- Effects: the `succeeded→refunded` CAS in the refund effects repository (slice 3) is where "refund
  done" fires once.
- Tests: `createCaller` pattern (`server/api/routers/refund.integration.test.ts:16-34`); key paths
  `test/deepKeys` `findKeyPaths` (used by `quiz.answerKey.integration.test.ts`); pure UI utils tests
  (`app/(admin)/admin/payouts/_components/RetryButton/utils.test.ts`); factories `makePayment`,
  `makeRefundRequest`, `makeOpenedLesson` (`test/factories.ts`).
- Conventions: `app/_components/componentConventions.contract.test.ts` (Props types not in
  `index.tsx`; `export function` budget 66 — new components are arrow consts).

**Per-task conventions:** as earlier slices — `pnpm typecheck` + `pnpm check` clean before each
commit; unit `*.test.ts` colocated; integration `*.integration.test.ts` never run in parallel with a
full integration run; user-visible strings for each state built in `utils.ts` and unit-tested.

---

## Task 1 — The state rules: what the row and the page show (U1–U4)

- **Contract:** `refundView.ts` exports `purchaseRefundRowState` and `refundPageState` plus
  `refundWindowEndsAt(paidAt)`. Row kinds: `request` (with the window end) · `status`
  (`processing` | `refunded` | `denied`) · `none`. Page kinds: `form` (amount, currency, window end)
  · `status` (processing / refunded with amount and refunded date / denied with failed conditions,
  reason, text, date) · `dispute` · `certificate` · `already_refunded` · `window_closed` (date) ·
  `over_limit` (condition, opened, threshold, or account count and limit).
- **Test:** `server/services/refund/refundView.test.ts` — one case per Branch B row and per status;
  precedence (request beats dispute; dispute beats window closed); window edge at 14 d − 1 s / 14 d
  (AC-F4); `refunded_by_bank` shows `refunded`; a payment refunded with no request (Dashboard) →
  row `none` (the existing "Refunded" badge stays), page `already_refunded` only if counting.
- **Files:** `server/services/refund/refundView.ts`, `server/entities/refund/refundView.dto.ts`
- **AC:** AC-F1, AC-F4, AC-F5 (naming), FR-S8–S12
- **Commit:** `feat(refund): row and page state rules`

- [ ] Write the failing test · [ ] See it FAIL (module missing) · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — The status read `refund.getForPayment` (C1, C23, C24)

- **Contract:** `refundRequestRepository.findForStudentView(paymentId, studentId)` loads the payment
  (where `id` **and** `studentId`, status `succeeded`/`refunded`) with its request in one query;
  `refundService.getRefundPage(studentId, paymentId, now)` checks the flag first, gathers the
  remaining facts read-only, and returns `refundPageState`; the router maps it to the DTO (U6).
- **Test:** `server/api/routers/refund.getForPayment.integration.test.ts` — own payment → its state;
  another student's payment → NOT_FOUND and no row written (AC-C1); flag off → NOT_FOUND (AC-C24);
  `INSTRUCTOR`/`ADMIN` → FORBIDDEN; extra input key rejected; a request with `refundError` set →
  `findKeyPaths` finds no `refundError`/`stripe*` key and the Stripe text appears nowhere (AC-C23).
- **Files:** `server/repositories/refundRequest.repository.ts`, `server/services/refund/refund.service.ts`,
  `server/api/routers/refund.ts`, `server/entities/refund/refundView.dto.ts`
- **AC:** AC-C1, AC-C23, AC-C24, FR-S8–S12, S19, S20
- **Commit:** `feat(refund): the student's refund status read`

- [ ] Write the failing test · [ ] See it FAIL (procedure missing) · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — The Purchases list carries the row state (U7)

- **Contract:** each `StudentPurchase` gains `refund: PurchaseRefundRowState | null`; `null` with the
  flag off. The list makes a fixed number of queries regardless of row count.
- **Test:** `server/services/billing/billing.service.integration.test.ts` (extend or create) — flag
  off → every `refund` is null; one row per state (window open, closed, certificate, earlier counting
  refund, dispute, processing, denied); query count is the same for 1 and 5 purchases (Prisma
  query event counter).
- **Files:** `server/repositories/payment.repository.ts`, `server/services/billing/billing.service.ts`,
  `server/entities/billing/purchase.ts`
- **AC:** AC-F1 (row)
- **Commit:** `feat(refund): purchases carry their refund state`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 4 — The request endpoint is rate-limited and its lock wait bounded (U9)

- **Contract:** `requestRefund` rejects a student over the limit before opening a transaction; inside
  it, a lock wait beyond the timeout fails with a typed `RefundBusyError` ("try again"), mapped to
  `TOO_MANY_REQUESTS`; nothing is written.
- **Test:** `server/services/refund/refundLimiter.integration.test.ts` — the N+1th request in the
  window is refused with no transaction opened; a request whose student lock is held by a concurrent
  open transaction rejects with `RefundBusyError` within the timeout; the normal path still refunds.
- **Files:** `server/services/refund/refund.service.ts`, `server/services/refund/refund.errors.ts`,
  `server/repositories/refundRequest.repository.ts`
- **AC:** `security.md` "Accepted for slice 1 only" item 1 (closed)
- **Commit:** `fix(refund): limit requests and bound the lock wait`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — Two student emails: refund done, automatic denial (U10)

- **Contract:** templates `refund.done` (name, course title, amount, currency) and `refund.denied`
  (name, course title, the failed condition as a fixed label) — strict payloads, no free text. "Done"
  is sent once when the effects move a payment to `refunded` on path `refund_request`; "denied" once
  after a denying request commits. Neither on a Dashboard refund, an exception or a lost dispute;
  neither to an anonymised account.
- **Test:** `server/services/refund/refundEmails.integration.test.ts` — automatic approval that
  succeeds at once → one `refund.done`; approval left `processing`, then completed by the job → one
  `refund.done` then, none before; a replayed completion → still one; denial → one `refund.denied`
  naming the condition; Dashboard refund → none; payload schema rejects an extra `text` key.
- **Files:** `server/services/email/email.templates.ts`, `app/_emails/RefundDoneEmail/`,
  `app/_emails/RefundDeniedEmail/`, the refund effects module, `server/services/refund/refund.service.ts`
- **AC:** AC-F21 (rows "Automatic refund done", "Automatic denial"), FR-S21 (part)
- **Commit:** `feat(refund): email the student on refund and on denial`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — The Purchases row (U13)

- **Contract:** `BillingHistoryList` split into `components/PurchaseRow`, `components/StatusBadge`,
  `components/RefundRowAction` (each `index.tsx` + `types.ts`, arrow consts), formatters in
  `utils.ts`. `RefundRowAction` renders by `refund.kind`: `request` → a quiet "Request a refund" link
  to `/dashboard/billing/<paymentId>/refund` with a tooltip "Refundable until <date, UTC>" and a link
  to `/pricing#refund-policy`; `status` → "Refund processing" / "Refunded" / "Denied"; `none` or
  `null` → nothing.
- **Test:** `app/_components/Billing/components/BillingHistoryList/components/RefundRowAction/utils.test.ts`
  — label per status, tooltip text with the UTC date (a date that differs by timezone), href;
  `componentConventions.contract.test.ts` stays green.
- **Files:** `app/_components/Billing/components/BillingHistoryList/**`
- **AC:** AC-F1 (row), FR-S1, S12
- **Commit:** `feat(refund): the refund action on the purchases row`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — The refund page and the request form (U3, U4, U8, U12)

- **Contract:** `app/dashboard/billing/[paymentId]/refund/page.tsx` reads `refund.getForPayment`;
  NOT_FOUND → `notFound()`. It renders `app/_components/Billing/components/RefundPage/` with one
  sub-component per kind: `RefundRequestForm` (closed-list reason, optional text ≤ 2000, the amount,
  the three consequences; owns the `refund.request` mutation; on success or CONFLICT re-reads the
  page), `RefundStatusView` (processing → the exact FR-S20 text; refunded → amount and the 5–10
  business days note; denied → the failed condition by name; the submitted reason and text as plain
  text), `RefundUnavailable` (window closed with date, certificate, dispute FR-S11 text, already
  refunded), `RefundOverLimit` (condition and numbers, no button yet — U4). All texts built in
  `utils.ts`.
- **Test:** `app/_components/Billing/components/RefundPage/**/utils.test.ts` — the exact FR-S20,
  FR-S11, FR-S8 strings; the over-threshold sentence with numbers; the account-limit sentence; the
  consequence list; the amount formatted from cents. Contract:
  `app/_components/Billing/noRawHtml.contract.test.ts` — no `dangerouslySetInnerHTML` under
  `app/_components/Billing/` (AC-C22).
- **Files:** `app/dashboard/billing/[paymentId]/refund/page.tsx`,
  `app/_components/Billing/components/RefundPage/**`, `app/_components/Billing/noRawHtml.contract.test.ts`
- **AC:** AC-F1 (page), AC-F5 (naming), AC-F23 (page text), AC-F24, AC-C22 (student half), FR-S3,
  S4, S8–S11, S14 (denial view), S19, S20
- **Commit:** `feat(refund): the refund page and request form`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — `/pricing` states the policy; the course page drops the old promise (U11)

- **Contract:** `server/services/refund/refundPolicy.ts` exports the policy text (14 days from
  payment; automatic if you opened no more than 3 lessons and no more than half the course; none
  after a certificate; one refund per course; request it from the Purchases page). With the flag on,
  `/pricing` shows it in a section `#refund-policy` and its FAQ answer points to the Purchases page;
  `CourseDetailEnrollCard` and `PurchaseConfirmDialog` render no refund text. Flag off → today's
  text everywhere.
- **Test:** `server/services/refund/refundPolicy.test.ts` — the text states each term, names the
  Purchases page, and does not contain "contact us" or "30-day" (AC-F19); the FAQ builder returns the
  old answer with the flag off and the new one with it on.
- **Files:** `server/services/refund/refundPolicy.ts`, `app/(marketing)/pricing/page.tsx`,
  `app/_components/Course/components/BrowseCourse/CourseDetailEnrollCard/index.tsx` (+ `types.ts`),
  `app/_components/Course/components/PurchaseConfirmDialog/index.tsx` (+ `types.ts`) and their callers
- **AC:** AC-F19, AC-F1 ("the course page renders no refund element"), FR-P21, UI-1
- **Commit:** `feat(refund): the refund policy on /pricing`

- [ ] Write the failing test · [ ] See it FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains U1–U13; `security.md` slice-7 status (C1, C22, C23, C24,
  the slice-1 limiter item closed); `spec.md` stays `in-progress`.
- **Commit:** `docs(refund): record slice-7 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030. No task includes
code: no migration, and the money path is unchanged (Task 4 adds a guard in front of it).

## Self-review

| AC / control | Task | Covered |
|---|---|---|
| AC-F1 | 1, 3, 6, 7, 8 | Rules, row, page, course page; rendering checked by hand at `/qa` |
| AC-F2 | existing (slice 1/3) + 7 | The form submits; the decision and snapshot are slice 1 |
| AC-F4 | 1 | UI half (window end shown, edge); judgement at submit is slice 1 |
| AC-F5 | 1, 7 | Naming the condition and numbers; "Ask an admin to review" → slice 8 (U4) |
| AC-F19 | 8 | Full |
| AC-F21 | 5 | Rows "automatic refund done", "automatic denial"; the rest per Scope |
| AC-F23 | 7 | Page text; day-3 emails were slice 5 |
| AC-F24 | 7 | Form, amount, consequences, refunded view; "Under review" → slice 8 |
| AC-C1 | 2, 7 | Read and page return not found for another student |
| AC-C22 | 7 | Student half (plain text + contract test); admin queue → slice 8 |
| AC-C23 | 2, 7 | DTO key test + fixed text |
| AC-C24 | 2 | Read returns not found with the flag off (the request already does) |
| Slice-1 limiter item | 4 | Closed |

**Contract consistency:** `PurchaseRefundRowState` and `RefundPageState` (Task 1) are consumed by
Tasks 2, 3, 6, 7; `getForPayment` (Task 2) by Task 7; `refundPolicy` (Task 8) only by the pages.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it: remove `studentId` from the read's `where` → Task 2's other-student test red; add a
  `dangerouslySetInnerHTML` under Billing → the contract test red; spread the request row into the DTO
  → the key-path test red.
- Manual, flag on, local DB: a fresh purchase shows "Request a refund" with the tooltip date; the
  page shows the amount and consequences; submit → "Refunded" or "Refund processing" and the email in
  the Resend log; open 4 of 6 lessons → the over-limit sentence; another student's payment id in the
  URL → 404; a reason `<img src=x onerror=alert(1)>` renders as text; `/pricing#refund-policy`
  states the terms; the course page has no refund text. Flag off → no refund element anywhere, old
  `/pricing` text.
