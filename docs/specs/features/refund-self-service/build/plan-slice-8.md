# Refund self-service — Slice 8: appeals and the admin exception — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session (ADR-030).
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Earlier slices: [`plan.md`](plan.md) … [`plan-slice-7.md`](plan-slice-7.md).

**Goal:** A student whose refund the rules do not allow can appeal once, with optional evidence
files; an admin decides from a queue, with a final, audited decision; undecided appeals follow the
day-14 rules; an admin can refund any payment as an exception; Dashboard refunds and lost disputes
are reported (FR-S13–S18, FR-A1–A7, the remaining FR-S21 rows).

**Architecture:** One refund record per payment stays the anchor: `refund_requests` (one row per
payment) gains an `approval` column (`automatic` | `appeal` | `overdue`) and a `direct_appeal`
decision, so every approved refund — automatic, appeal or overdue — runs through the existing
`executeRefund` and its retries. A new `refund_appeals` table (one per payment) holds the appeal;
`refund_evidence_files` holds file metadata, the bytes live in a **private** Vercel Blob store; a new
append-only `refund_audit` table, guarded by a Postgres trigger, records every approve, deny, overdue
approval and exception (C18). The release predicate holds the share while an appeal is open. Files
travel as multipart to route handlers (the repo's upload pattern); decisions without files go
through `adminProcedure`s. Counting follows the spec: an appeal or overdue approval counts for D3 but
not for the account limit; an exception counts for neither.

**Spec:** [`../spec.md`](../spec.md) FR-S13–S18, FR-A1–A7, FR-S21 (rows: appeal filed, appeal
undecided, appeal decided, Dashboard refund, dispute closed lost), terms "counting refund" and
"account-limit refund"; AC-F5 (button), F6, F8, F9, F10, F21, F24 ("Under review"); AC-C6 (open
appeal holds the share), C11, C17, C18, C20, C21, C22 (admin half); [`../security.md`](../security.md)
C11, C17, C18, C20, C21, C22.

**Track:** `pnpm classify` → **guarded**: a database migration with a trigger, new tables, new
`adminProcedure`s and student procedures, two new route handlers (multipart upload, file download), a
new env var (private Blob token), the money path (release predicate, refund on approval, exception
refund). No AI surface. `/qa`: `security-auditor` only.

### Scope of this slice

**In:** direct appeal and appeal after an automatic denial, with deadlines; evidence upload,
validation by content and private storage; the authorizing download route; "Under review"; the admin
queue, approve and deny (with files), audit; overdue auto-approval and admin reminders; the exception
refund; the Dashboard-refund notice and "needs review" list; the lost-dispute emails; the appeal
emails; the admin half of C22.

**Out (slice 9):** evidence deletion 30 days after the decision (FR-P22); account deletion closing an
open appeal and erasing refund text and files (FR-P23, C29); the instructor view and its isolation
contract (FR-I1–I3, C19 — this slice adds no instructor-facing code and no instructor email); partial
refund amounts (FR-P16), double charge (FR-P17), bank failure (FR-P27), repurchase warning (FR-S23).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| V1 | `refund_requests` stays one row per payment. A direct appeal creates that row with decision `direct_appeal` (failed conditions = the exceeded ones, the FR-S5 snapshot). An approval sets `approval` and `refundState = processing`; `executeRefund` accepts any approved row | One anchor for retries, overdue panel, day-3 emails, effects and the student status; no second refund pipeline | Where an appeal-approved refund lives |
| V2 | Counting by `approval`: D3 ("counting refund") = approval in {automatic, appeal, overdue} or a lost dispute; account limit = approval automatic or a lost dispute. Existing `auto_approved` rows are backfilled to `approval = automatic` in the migration | The spec's two definitions; today's filters read `decision = 'auto_approved'` | — (implements the terms) |
| V3 | `refund_appeals`: one per payment (unique), `kind` direct / after_denial, `exceeded_condition`, reason, text (required, ≤ 2000), snapshot (direct), `deadline_at`, `status` open / approved / denied / overdue_approved, `decided_at`, `decided_by`, `denial_reason` | FR-S7 one appeal per purchase; FR-A1 queue fields; FR-A5 needs the exceeded condition from the server snapshot (C11) | Data model |
| V4 | `refund_audit` is append-only: no update/delete methods in its repository, and a trigger raising on UPDATE and DELETE. Each approve, deny, overdue approval and exception writes exactly one row in the same transaction as the state change | C18 / AC-C18 | — |
| V5 | Evidence bytes go to a separate private Blob store (`access: "private"`, token `REFUND_EVIDENCE_BLOB_TOKEN`, optional in dev/test, required to accept files in production); pathnames are random, never the file name; the original name is stored only as metadata and sent in `Content-Disposition` sanitised | C20: never a public URL; `@vercel/blob` 2.3.1 supports private access and `get` | Storage |
| V6 | Content check by magic bytes (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, PDF `25 50 44 46 2D`); ≤ 3 files and ≤ 4 MB total per submission; the declared type and extension are ignored | C21 | — |
| V7 | Download route `GET /api/refunds/evidence/[fileId]`: session required; served only to the payment's student or an ADMIN, everyone else 404 (instructor included); headers `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store` | C20, C21 serving half | — |
| V8 | Appeal filing is a multipart `POST /api/refunds/appeals` (text and files in one request, FR-S15) calling `refundAppealService.fileAppeal`; same flag check (C24), same per-student limiter and lock pattern as the request (U9), ownership in the authorizing query (C1). Files are uploaded after validation and before the transaction; on any failure the uploaded blobs are deleted | One request per FR-S15; no orphan files | Transport |
| V9 | Direct appeal is allowed only when the page state is `over_limit` at filing (window open, every other condition holds); an appeal after denial only on an `auto_denied` request before its deadline (FR-S16) | FR-S13, S14, S16 | Re-check at filing |
| V10 | Release predicate gains "no open appeal on the payment" in the one conditional claim (all four paths) | A3: the money stays held while an appeal waits; FR-A5 "the money stays held" | AC-C6 extension |
| V11 | Overdue auto-approval runs in the daily payout job before the release step, under the run lock: open after-denial appeals whose window has ended and whose exceeded condition is not `threshold` / `account_limit` are approved with audit kind `overdue` and refunded (C11) | No race with the release; the failed condition comes from the stored request, never input | Where FR-A5 runs |
| V12 | Admin reminders in the daily watchdog: for each open appeal, on payment-day 10 and 13, then daily from day 14, one email per admin per appeal per UTC day; "appeal filed" is sent to admins at filing | FR-A4, notification matrix | — |
| V13 | Approve re-checks certificate and dispute at decision time and is refused with the reason (the queue shows the same reason, disabled); deny requires a reason (1–2000 chars) and accepts 0–3 admin files with the same checks, via `POST /api/admin/refunds/appeals/[id]/deny` (multipart); approve is an `adminProcedure` | FR-A2, AC-F8, C17 | Transport for admin files |
| V14 | Exception refund `adminProcedure` (`paymentId`, reason): runs under the payout run lock; refused while an appeal is open or a refund is processing on the payment ("decide the appeal first"); Stripe refund with the same idempotency key `refund:<paymentId>`; effects on path `admin_exception`; one audit row. It creates no `refund_requests` row, so it counts for neither D3 nor the account limit | FR-A6, AC-F10, FR-P10 | Exception vs an open appeal |
| V15 | `payments.needs_review_at`: set on every Dashboard refund (full, via effects path `dashboard_refund`; partial, in `chargeRefunded` before its early return), with one admin email each; the admin page lists them with "Mark reviewed" (clears it) | FR-A7 | Panel shape |
| V16 | Emails: `admin.appeal-filed`, `admin.appeal-undecided`, `refund.appeal-decided` (outcome approve/deny/overdue; the denial reason is admin text and is included — it is shown to the student anyway, FR-S18), `admin.dashboard-refund`, `refund.dispute-lost` (student: access closed), `admin.dispute-lost`. Strict payloads; no student free text in any admin email (C22). The appeal-decided email joins the daily resend sweep | Notification matrix; slice-7 retry pattern | — |
| V17 | Student page: `over_limit` shows "Ask an admin to review" opening the appeal form; a denied request with its appeal right open shows an "Appeal" form; an open appeal shows "Under review" with "Submitted on <date>. We will email you when it is decided."; a denied appeal shows the admin's reason and file downloads (FR-S18). `RefundStateView` becomes an exhaustive `switch` (slice-7 minor M7) | FR-S13–S18, AC-F24 | — |
| V18 | Admin page `/admin/refunds`: queue (oldest first) with reason, text, evidence downloads, snapshot, days left, approve/deny; the exception form; the needs-review list. All free text rendered as text; the no-raw-HTML contract test is extended to it | FR-A1, A6, A7, AC-C22 admin half | — |

Each is logged in `discovery/ai-decision-log.md` in the last task.

**Codebase anchors (verified during planning):**
- Schema: `RefundRequest` (`prisma/schema/refund.prisma:24-50`, `paymentId @unique`, enums `:1-19`);
  `Payment` (`prisma/schema/payments.prisma:38-76`, `RefundSource` already has `admin_exception`
  `:25-30`); `CertificateRevocationReason.admin_exception` (`prisma/schema/enrollment.prisma:8-13`);
  last migration `20261126120000_payout_run_error`; enum value pattern
  `20261125120000_disputes/migration.sql:9`; raw SQL/DO-block pattern
  `20260828190000_concept_mastery_key/migration.sql`; `test/db.ts:6-44` `TABLES` (new tables added).
- Request path: `refundService.requestRefund` (`server/services/refund/refund.service.ts:131-251`,
  limiter `:137`, lock `:143-147`), `executeRefund` (`:265-343`, requires `processing`), `getRefundPage`
  (`:64-124`), `createStripeRefund` (`:346-373`, key `refund:${paymentId}`).
- Counting: `hasCountingRefund` `:118-132`, `countAccountLimitRefunds` `:138-158`,
  `findCountingRefundCourseIds` `:184-207`, `findUnnotifiedOutcomes` `:214-236`
  (`server/repositories/refundRequest.repository.ts`).
- Rules/views: `refundRules.ts` (`decideRefund` `:29-58`); `refundView.ts` (`requestStatus` `:25-35`,
  `refundPageState` `:76-108`); `refundView.dto.ts` (`RefundRequestStatus` `:19-20`, `RefundPageState`
  `:52-70`).
- Effects: `refundEffectsService.apply` (`server/services/refund/refundEffects.service.ts:25-74`);
  `claimRefund` / `applyInTx` (`server/repositories/refundEffects.repository.ts:17-91`).
- Release: `payoutRepository.claimForRelease` / `findReleaseCandidates`
  (`server/repositories/payout.repository.ts`), tests `payout.repository.integration.test.ts`.
- Jobs: `PayoutJobService.run` (`server/services/payments/payoutJob.service.ts:163-227`, slot between
  `retryRefunds` and the release `:175-188`), `underRunLock` (`:272-286`); watchdog `check`
  (`server/services/payments/payoutWatchdog.service.ts:14-28`).
- Admin: layout guard `app/(admin)/layout.tsx:6-18`; payouts page and `_components`
  (`app/(admin)/admin/payouts/**`); `adminProcedure` (`server/api/trpc.ts:235`); admin procedures and
  tests (`server/api/routers/payment.ts:144-202`, `payoutAdmin.integration.test.ts:47-62`); emails
  (`server/services/payments/adminAlert.service.ts`, `server/services/email/sendOnce.ts`,
  `server/services/email/email.templates.ts`); `userRepository.findAdmins` (`:55-61`).
- Stripe events: `chargeRefunded` (`server/services/payments/stripeEvent.service.ts:111-131`, partial
  early return `:115`); `disputeChanged` lost path (`:93-103`).
- Files: `vercelService` (`server/services/vercel/vercel.service.ts`, public store today);
  multipart route pattern `app/api/uploads/route.ts:17-39`; file response pattern
  `app/api/invoices/[paymentId]/route.ts:5-39`; session mock pattern
  `app/api/chat/course/route.integration.test.ts:10`.
- Student UI: `app/_components/Billing/components/RefundPage/**` (`RefundStateView`, `RefundOverLimit`,
  `RefundStatusView`, `RefundRequestForm`), `app/dashboard/billing/[paymentId]/refund/page.tsx`;
  `refundLabels.ts`.

**Per-task conventions:** as earlier slices — TDD, `pnpm typecheck` + `pnpm check` before each commit,
integration tests never in parallel with a full run, `@vercel/blob` mocked in every test.

---

## Task 1 — Schema: appeals, evidence, append-only audit, approval, needs review (V1–V4, V15)

`code included: the migration's trigger and backfill are what is being approved`

- **Contract:** migration `20261127120000_refund_appeals`:
  - `RefundDecision` + `direct_appeal`; enum `RefundApproval { automatic appeal overdue }`;
    `refund_requests.approval RefundApproval NULL`, backfilled `automatic` where
    `decision = 'auto_approved'`;
  - `refund_appeals` (V3), `refund_evidence_files` (id, appeal_id, uploaded_by `student|admin`,
    blob_pathname, file_name, content_type, size_bytes, created_at, deleted_at), `refund_audit` (id,
    kind `appeal_approved|appeal_denied|appeal_overdue|exception`, payment_id, appeal_id NULL,
    admin_id NULL, reason NULL, created_at);
  - `payments.needs_review_at TIMESTAMP NULL`;
  - the trigger:

    ```sql
    CREATE FUNCTION refund_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'refund_audit is append-only (C18)';
    END $$;
    CREATE TRIGGER refund_audit_no_change BEFORE UPDATE OR DELETE ON refund_audit
      FOR EACH ROW EXECUTE FUNCTION refund_audit_append_only();
    ```
  - `test/db.ts` `TABLES` gains the three tables (TRUNCATE does not fire row triggers).
- **Test:** `server/repositories/refundAppealSchema.integration.test.ts` — UPDATE and DELETE on an
  audit row fail in Postgres; a second appeal for one payment violates the unique key; the backfill
  sets `approval = automatic` on approved rows only (seeded before the migration in a fixture SQL, or
  asserted via a direct insert + the migration's UPDATE statement).
- **Files:** `prisma/schema/refund.prisma`, `prisma/schema/payments.prisma`,
  `prisma/migrations/20261127120000_refund_appeals/migration.sql`, `test/db.ts`, `test/factories.ts`
  (`makeAppeal`, `makeEvidenceFile`)
- **AC:** AC-C18 (DB half), FR-S7 (one appeal)
- **Commit:** `feat(refund): appeals, evidence and append-only audit tables`

- [ ] Failing test · [ ] FAIL · [ ] Migration + `pnpm db:generate` against local and `learnix_test` · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — Counting follows the approval; any approved request can be refunded (V1, V2)

- **Contract:** D3 counts approval in {automatic, appeal, overdue} plus lost disputes; the account
  limit counts approval `automatic` plus lost disputes; the request path writes `approval = automatic`
  on an automatic approval; `executeRefund` refunds any request with an approval and `processing`.
  `findUnnotifiedOutcomes` keys "refund done" on approval, not on the decision.
- **Test:** `server/repositories/refundCounting.integration.test.ts` — an appeal-approved refund
  blocks a repurchase refund (D3) but is not in the account limit; an overdue one the same; an
  exception (no request) counts for neither; existing refund integration suites stay green.
- **Files:** `server/repositories/refundRequest.repository.ts`, `server/services/refund/refund.service.ts`
- **AC:** terms "counting refund", "account-limit refund"; AC-F10 (not counted)
- **Commit:** `feat(refund): counting follows how a refund was approved`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — An open appeal holds the instructor's share (V10)

- **Contract:** `claimForRelease` and `findReleaseCandidates` do not take a payment with an open
  appeal; once the appeal is decided (denied, approved and refunded) the usual predicate applies.
- **Test:** `server/repositories/payout.repository.integration.test.ts` (extend) — eligible payment
  with an open appeal is not claimed; after a denial it is claimed; candidates exclude it.
- **Files:** `server/repositories/payout.repository.ts`
- **AC:** AC-C6 (extended to appeals), FR-A5 "the money stays held"
- **Commit:** `feat(refund): an open appeal holds the share`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 4 — Appeal rules (pure): who may appeal, until when, what becomes overdue, when to remind (V9, V11, V12)

- **Contract:** `server/services/refund/appealRules.ts`: `appealDeadline({ kind, windowEndsAt,
  deniedAt })` (direct → window end; after denial → later of window end or denial + 3 d);
  `isAutoApprovable(appeal, now)` (open, after_denial, window ended, exceeded condition not threshold /
  account limit); `appealReminderDue(paidAt, now)` (payment-day 10, 13, or ≥ 14).
- **Test:** `server/services/refund/appealRules.test.ts` — both deadlines incl. the later-of rule;
  every exceeded condition for auto-approval (threshold and account limit never); window edge;
  reminder days 9 (no), 10, 11 (no), 13, 14, 20.
- **Files:** `server/services/refund/appealRules.ts`
- **AC:** AC-F6 (deadline), AC-C11 / F9 (rule), FR-A4
- **Commit:** `feat(refund): appeal deadline, overdue and reminder rules`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — Evidence files are checked by content and size (V6)

- **Contract:** `server/services/refund/evidenceFiles.ts` `validateEvidence(files)` returns the
  accepted files with their detected type, or a typed `EvidenceRejectedError` naming why (type, count,
  size); detection reads the first bytes only.
- **Test:** `server/services/refund/evidenceFiles.test.ts` — PNG, JPEG, PDF accepted; an SVG renamed
  `.png` with `image/png` rejected; a text file declared `application/pdf` rejected; 4 files rejected;
  3 files totalling 4 MB + 1 byte rejected; 0 files accepted.
- **Files:** `server/services/refund/evidenceFiles.ts`, `server/services/refund/refund.errors.ts`
- **AC:** AC-C21 (upload half), AC-F8 (no files accepted)
- **Commit:** `feat(refund): evidence files checked by content`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — Private storage and the authorizing download route (V5, V7)

- **Contract:** `refundEvidenceStorage` (`put` with `access: "private"` and a random pathname, `get`,
  `del`, using `REFUND_EVIDENCE_BLOB_TOKEN` added to `lib/env.js` + `runtimeEnv`);
  `GET /api/refunds/evidence/[fileId]` serves the bytes to the payment's student or an admin — one
  query joining file → appeal → payment, authorised by the session — with V7's headers; anyone else,
  or no session, 404.
- **Test:** `app/api/refunds/evidence/[fileId]/route.integration.test.ts` — the student and an admin
  get the file with `attachment`, `nosniff`, `sandbox` CSP and `no-store`; another student, the
  course's instructor and an anonymous caller get 404; a deleted file 404; `@vercel/blob` mocked and
  asserted to be called with `access: "private"`; a contract assertion that no evidence code calls
  `put` with `access: "public"`.
- **Files:** `server/services/refund/refundEvidenceStorage.ts`, `lib/env.js`,
  `app/api/refunds/evidence/[fileId]/route.ts`, `server/repositories/refundAppeal.repository.ts`
- **AC:** AC-C20, AC-C21 (serving half)
- **Commit:** `feat(refund): private evidence storage and download route`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — A student files an appeal (V8, V9, V16 "appeal filed")

- **Contract:** `refundAppealService.fileAppeal(studentId, { paymentId, reason, text, files })`:
  flag off or not the caller's payment → NOT_FOUND; limiter and bounded lock as the request; direct
  appeal only from `over_limit` (creates the `direct_appeal` request row with the snapshot, the appeal
  with kind and exceeded condition); after-denial appeal only on an `auto_denied` request before its
  deadline; a second appeal → CONFLICT; reason and text required; files validated, uploaded, and
  deleted again if the transaction fails. Admins get `admin.appeal-filed` (no student text).
  `POST /api/refunds/appeals` parses the multipart body and maps errors to status codes.
- **Test:** `server/services/refund/refundAppeal.service.integration.test.ts` — direct appeal stores
  the snapshot, kind `direct` and the exceeded condition (AC-F8); after-denial appeal stores kind and
  the request's failed condition; no files accepted; missing reason or text rejected; past the
  deadline rejected; another student NOT_FOUND (AC-C1); flag off NOT_FOUND (AC-C24); second appeal
  CONFLICT (AC-F6); a rejected file uploads nothing; a failed transaction deletes uploaded blobs;
  admin email sent once without the text. Route test
  `app/api/refunds/appeals/route.integration.test.ts`: 401 without a session, 404/409/413/415/422
  mapping, success 201.
- **Files:** `server/services/refund/refundAppeal.service.ts`,
  `server/repositories/refundAppeal.repository.ts`, `app/api/refunds/appeals/route.ts`, email template +
  `app/_emails/AppealFiledEmail/`
- **AC:** AC-F5 (filing), AC-F6, AC-F8 (student half), AC-C1, AC-C21, AC-C24, FR-S13–S16
- **Commit:** `feat(refund): students file appeals with evidence`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — The admin decides: queue, approve, deny, audit (V13, V16 "appeal decided")

- **Contract:** `adminProcedure`s `refundAdmin.listOpenAppeals` (oldest first: reason, text, files,
  snapshot, days left, `approveBlockedBy: "certificate" | "dispute" | null`) and
  `refundAdmin.approveAppeal({ appealId })`; route `POST /api/admin/refunds/appeals/[id]/deny`
  (multipart: reason 1–2000, 0–3 files). Approve: re-check certificate and dispute (refused with the
  reason); one transaction sets the appeal approved, the request's approval `appeal` and
  `refundState = processing`, writes one audit row; then `executeRefund`. Deny: appeal denied with the
  reason and files, one audit row. A decided appeal cannot be decided again. The student gets
  `refund.appeal-decided`; the daily resend sweep covers it.
- **Test:** `server/api/routers/refundAdmin.integration.test.ts` — STUDENT and INSTRUCTOR FORBIDDEN on
  every procedure (AC-C17); approve refunds and writes exactly one audit row (AC-C18); approve with a
  certificate or an open dispute refused with the reason (AC-F8); deny without a reason rejected; a
  second decision CONFLICT; the queue is oldest first with days left; the email sent once and resent
  by the sweep after a failure. Route test for deny: non-admin 404/403, reason missing 422, files
  validated.
- **Files:** `server/api/routers/refundAdmin.ts`, `server/api/root.ts`,
  `server/services/refund/refundAppealAdmin.service.ts`, `server/repositories/refundAudit.repository.ts`,
  `app/api/admin/refunds/appeals/[id]/deny/route.ts`, email template + `app/_emails/AppealDecidedEmail/`,
  `refundNotifications.service.ts`, `refundRequest.repository.ts`
- **AC:** AC-F8 (admin half), AC-C17, AC-C18, FR-A1–A3, FR-S18
- **Commit:** `feat(refund): the admin decides appeals`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — Day 14: overdue approval and admin reminders (V11, V12)

- **Contract:** the payout job approves `isAutoApprovable` appeals (audit `appeal_overdue`, approval
  `overdue`, student email) and refunds them, before the release step; the watchdog sends
  `admin.appeal-undecided` on payment-day 10 and 13, then daily, once per admin per appeal per UTC
  day.
- **Test:** `server/services/payments/appealOverdue.integration.test.ts` — an after-denial appeal for
  the window condition on day 14 is approved, audited `overdue` and refunded (AC-C11); one for the
  threshold or the account limit, and every direct appeal, stays open and gets a daily reminder;
  reminders on days 10 and 13, none on day 11, daily after 14, never twice a day.
- **Files:** `server/services/payments/payoutJob.service.ts`, `server/services/payments/payoutWatchdog.service.ts`,
  `server/services/refund/refundAppealAdmin.service.ts`, email template + `app/_emails/AppealUndecidedEmail/`
- **AC:** AC-F9, AC-C11, FR-A4, FR-A5
- **Commit:** `feat(refund): overdue appeals and admin reminders`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 10 — The exception refund (V14)

- **Contract:** `refundAdmin.refundException({ paymentId, reason })`: reason required; refused while an
  appeal is open or a refund is processing; under the payout run lock; Stripe refund with key
  `refund:<paymentId>`; effects on path `admin_exception` (certificate revoked with that reason); one
  audit row `exception`.
- **Test:** `server/api/routers/refundException.integration.test.ts` — the effects apply and the
  certificate is revoked "admin exception"; not counted for D3 or the account limit; one audit row;
  STUDENT/INSTRUCTOR FORBIDDEN; no reason rejected; open appeal refused; run lock held → CONFLICT; a
  repeat after success is a no-op (idempotent), no second audit row.
- **Files:** `server/services/refund/refundAppealAdmin.service.ts`, `server/api/routers/refundAdmin.ts`,
  `server/services/payments/payoutJob.service.ts` (expose the lock helper)
- **AC:** AC-F10, AC-C17, AC-C18, FR-A6
- **Commit:** `feat(refund): the admin exception refund`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 11 — Dashboard refunds flagged and reported; lost disputes reported (V15, V16)

- **Contract:** a full Dashboard refund (effects applied on path `dashboard_refund`) and a partial one
  (in `chargeRefunded`) set `needs_review_at` and email the admins once per payment;
  `refundAdmin.listNeedsReview` / `markReviewed`; a dispute closed lost emails the student
  (`refund.dispute-lost`, access closed) and the admins, once.
- **Test:** `server/services/payments/dashboardRefundNotice.integration.test.ts` — full and partial each
  flag and email once; a replayed event sends nothing more; a Learnix refund's own webhook does not
  flag; mark reviewed clears it (admin only); lost dispute emails once to each side; no student text
  in admin emails.
- **Files:** `server/services/payments/stripeEvent.service.ts`, `server/services/refund/refundEffects.service.ts`,
  `server/services/payments/adminAlert.service.ts`, `server/repositories/payment.repository.ts`,
  `server/api/routers/refundAdmin.ts`, templates + `app/_emails/{DashboardRefundEmail,DisputeLostEmail,DisputeLostAdminEmail}/`
- **AC:** AC-F21 (rows Dashboard refund, Dispute closed lost), FR-A7
- **Commit:** `feat(refund): report Dashboard refunds and lost disputes`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 12 — Student UI: appeal, "Under review", the decision (V17)

- **Contract:** `refundPageState` gains `over_limit` with `canAppeal` + deadline, `status: denied` with
  `appeal: { deadline } | null`, `status: under_review` (submitted date), `appeal_denied` (admin reason,
  file ids); the row shows "Under review". `RefundStateView` is an exhaustive `switch` with a `never`
  check. `AppealForm` (client) posts multipart to `/api/refunds/appeals` and re-reads the page; texts in
  `utils.ts`.
- **Test:** `refundView.test.ts` (extend) — every new state and precedence; `RefundPage/**/utils.test.ts`
  — the FR-S17 text, the appeal deadline line, the admin-decision text; contract tests stay green
  (`noRawHtml`, component conventions).
- **Files:** `server/services/refund/refundView.ts`, `server/entities/refund/refundView.dto.ts`,
  `server/services/refund/refund.service.ts` (page facts), `app/_components/Billing/components/RefundPage/**`,
  `RefundRowAction/utils.ts`
- **AC:** AC-F5 (button), AC-F24 ("Under review"), FR-S13–S18
- **Commit:** `feat(refund): appeal and its status on the refund page`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 13 — Admin UI: queue, exception, needs review (V18)

- **Contract:** `app/(admin)/admin/refunds/page.tsx` with `_components` per folder: `AppealQueue`
  (rows with reason, text, evidence links, snapshot summary, days left, `ApproveButton` disabled with
  the reason, `DenyDialog` posting multipart), `ExceptionRefundForm`, `NeedsReviewList`; each owns its
  mutation; labels and summaries in `utils.ts`. Link from the admin nav/payouts page.
- **Test:** `utils.test.ts` per component (days-left label, snapshot summary, blocked reason text);
  `app/(admin)/admin/refunds/noRawHtml.contract.test.ts` — no `dangerouslySetInnerHTML` (AC-C22 admin
  half).
- **Files:** `app/(admin)/admin/refunds/**`
- **AC:** FR-A1, A2, A6, A7, AC-C22 (admin half)
- **Commit:** `feat(refund): admin refunds page`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 14 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains V1–V18; `security.md` slice-8 status (C11, C17, C18, C20,
  C21, C22); `.env.example` gains `REFUND_EVIDENCE_BLOB_TOKEN`; Release checklist: the private Blob
  store (already listed) and the migration applied to the production database; `spec.md` stays
  `in-progress`.
- **Commit:** `docs(refund): record slice-8 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030. Code is included
only for the audit trigger (Task 1), where the exact form is the control.

## Self-review

| AC / control | Task | Covered |
|---|---|---|
| AC-F5 | 7, 12 | Button and filing |
| AC-F6 | 1, 4, 7 | One appeal, deadlines |
| AC-F8 | 5, 7, 8, 12 | Files optional, reason/text required, snapshot, approve blocked, denial reason shown |
| AC-F9 / AC-C11 | 4, 9 | Overdue rule and job |
| AC-F10 | 2, 10 | Exception effects, not counted |
| AC-F21 | 7, 8, 9, 11 | Rows appeal filed, undecided, decided, Dashboard refund, dispute lost |
| AC-F24 | 12 | "Under review" |
| AC-C6 (appeals) | 3 | Open appeal holds the share |
| AC-C17 | 8, 10, 11 | Every admin procedure and route rejects others |
| AC-C18 | 1, 8, 9, 10 | Trigger; one audit row per decision |
| AC-C20 | 6 | Private store, authorizing route |
| AC-C21 | 5, 6, 7 | Content check, limits, download headers |
| AC-C22 | 8, 13 | Admin half: text rendering, no student text in admin emails |
| AC-C1 / C24 | 7 | Appeal endpoint not found for others / flag off |
| FR-P22, P23, C19, C29 | — | Slice 9 (Scope) |

**Contract consistency:** `approval` (Task 1) is read by Tasks 2, 8, 9; `appealRules` (Task 4) by Tasks
7, 9, 12; `validateEvidence` (Task 5) by Tasks 7, 8; `refundEvidenceStorage` (Task 6) by Tasks 7, 8;
the audit repository (Task 8) by Tasks 9, 10.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green; the migration
  applied to local `learnix` and `learnix_test`.
- Break-it: drop the trigger → the audit test red; remove the open-appeal clause from the release
  predicate → Task 3 red; serve evidence without the ownership join → the other-student test red;
  accept by declared type → the renamed-SVG test red.
- Manual, flag on, local DB with a private Blob token: open 4 of 6 lessons → "Ask an admin to review"
  → appeal with a PNG → "Under review"; as admin, approve → refunded, audit row; another purchase,
  deny with a reason and a PDF → the student sees the reason and downloads the PDF; another student's
  file URL → 404; an exception refund from the admin page; a Stripe CLI partial Dashboard refund →
  "needs review" and the admin email.
