# Refund self-service — Slice 9: the rest (P2/P3) — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session (ADR-030).
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Earlier slices: [`slice-1-auto-decision.md`](slice-1-auto-decision.md) … [`slice-8-appeals.md`](slice-8-appeals.md).

**Goal:** Close the remaining requirements: the instructor sees where held money is and nothing about
refunds; every payment records its Stripe fee; a partial Dashboard refund is recorded and a later
refund returns the remainder; a double charge is refunded at once; a refund that fails at the bank
restores access and goes to the admin; a repurchase after a counting refund is warned; evidence is
deleted 30 days after the decision; account deletion erases refund text and files (FR-I1–I3, FR-P16,
P17, P22, P23, P27, P28, FR-S22–S23).

**Architecture:** One migration adds the money facts the spec asks to record on `payments`
(`stripe_fee_cents`, `refunded_amount_cents`, `bank_failure_at`) and the enum values the new paths
need. Every new refund path reuses the existing pieces: `refundAtStripe` (list-then-create, one
idempotency key), `refundEffectsService.apply` (one CAS, `otherPaid` keeps the course), the audit
table, `sendOnce` notices, and the release predicate (one SQL `eligible`). The instructor's two held
amounts are computed from that same predicate, never re-derived. Daily work (fee fill-in, evidence
deletion) runs in the existing jobs, bounded per run.

**Spec:** [`../spec.md`](../spec.md) FR-I1–I3, FR-P16, P17, P22, P23, P27, P28, FR-S22, S23, EC-12,
EC-14, EC-17, EC-19, FS-3, FS-15; AC-F7, F12, F15, F16, F17, F18, F20, F27, F28, AC-C13, C19, C29;
[`../security.md`](../security.md) C19, C29, and the slice-1 accepted item "refund free text survives
account deletion".

**Track:** `pnpm classify` → **guarded**: a migration, the money path (double-charge refund, bank
failure, held amounts), new procedures (admin bank-failure outcomes, the deletion warning, the
repurchase fact), a new Stripe event type. No AI surface. `/qa`: `security-auditor` only.

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| W1 | Migration `20261129120000_refund_rest`: `payments.stripe_fee_cents`, `refunded_amount_cents`, `bank_failure_at` (all NULL); `RefundSource` + `duplicate_charge`; `CertificateRevocationReason` + `duplicate_charge` (the effects map is total); `AppealStatus` + `closed_account_deleted`; `RefundAuditKind` + `bank_failure_refunded_elsewhere`, `bank_failure_sale_stands` | One migration for the slice; enum values are additive | — |
| W2 | FR-P28: `finalizeCheckout` expands `latest_charge.balance_transaction` in the call it already makes and stores `fee` (USD cents); a failed read stores NULL and never fails the checkout; the daily payout job fills up to 50 missing fees per run for payments made from day 0 (`paid_at` ≥ the migration date) | FS-15: a measurement must not break checkout | Batch size |
| W3 | FR-P16: `refunded_amount_cents` takes Stripe's `amount_refunded` on every `charge.refunded` (partial and full). The refund page, the form, the "Refunded" note and the emails show the remainder `amount − refunded_amount` (the student is never told a larger sum than Stripe returns) | EC-19; `refundAtStripe` already refunds the remainder | Where the remainder is shown |
| W4 | FR-P17 / AC-C13: `finalizeCheckout` takes a per-(student, course) advisory lock; if another succeeded, unrefunded payment for that course already exists, this one is the duplicate: never `pending` for transfer, refunded at once through `refundAtStripe` + effects on path `duplicate_charge` (no request row → counts for neither D3 nor the account limit; `otherPaid > 0` keeps the course); the student gets `refund.duplicate-charge` and the success page says "You were charged twice; the second charge was refunded" | The race is two tabs creating two sessions; the lock serializes the finalizes | Which payment is the duplicate (the later finalize) |
| W5 | FR-P27: handle `charge.refund.updated` (and replay it) when the refund's status becomes `failed` on a payment whose effects were applied: set `bank_failure_at`, reactivate the enrollment (as a repurchase does — cleared records stay cleared, FS-3), put the share back to held (`transferStatus = pending`) and keep it out of release while `bank_failure_at` is set; the student gets `refund.bank-failed` (access restored), the admins `admin.bank-failure`, the payment appears in a "Refund failed at the bank" list | The spec's state, hold and notices; one new predicate line | Event type, state carrier |
| W6 | FR-P27 outcomes: `refundAdmin.resolveBankFailure({ paymentId, outcome, note })`, admin-only, one audit row each: "refunded another way" → share `cancelled`, payment stays refunded; "the sale stands" → payment back to `succeeded` (refund fields cleared), share follows the normal release rule; both clear `bank_failure_at` | FR-P27's two audited outcomes | Procedure shape |
| W7 | FR-I1: the instructor's two held amounts come from the release predicate: pending shares not yet eligible (window, open request/appeal, bank failure) → "On hold until the refund window closes"; eligible but the instructor's Stripe account cannot receive payouts → "Waiting for Stripe connection". `RevenueSummary` replaces `pendingCents` with `onHoldCents` and `waitingForStripeCents`; the Revenue cards show both | The spec's labels from the one predicate (no drift) | EC-14 split |
| W8 | C19: a contract test that no instructor-facing module (`app/_components/Instructor/**`, the instructor revenue service methods, instructor email templates) references refund request/appeal/evidence tables, and an integration test that revenue responses are identical with and without an open appeal apart from the held amounts | AC-C19 literally | — |
| W9 | FR-S23 / AC-F7: the course page and the browse grid pass `repurchaseNotRefundable` (a counting refund of the course, flag on) to `PurchaseConfirmDialog`, which shows "You have already refunded this course, so this purchase cannot be refunded"; `createCheckoutSession` refuses while a dispute on an earlier payment of the course is open (EC-17), explicitly rather than through the enrollment state | The warning must come from the server's counting definition | Data path for the warning |
| W10 | FR-P22: the daily watchdog deletes, per run up to 100, evidence files of appeals decided ≥ 30 days ago: blob first, then `deleted_at`; a failed blob delete stays for the next day; open appeals are never touched | Bounded and idempotent | Which job |
| W11 | FR-P23 / C29 / EC-12: inside `anonymiseAccount`'s transaction the student's request text becomes NULL, appeal text `""`, file names `"deleted"`, an open appeal `closed_account_deleted` (decided now, no approval, so it counts for nothing and the hold lifts); a processing refund is left to complete; after commit the student's blobs are deleted and marked `deleted_at`. The admin's denial reason and the audit stay | ADR-025 transaction rule: no network inside; AC-C29 | Order of DB vs blob work |
| W12 | EC-12 warning: `refund.openAppeals` (`protectedProcedure`, flag-gated, `[]` for non-students) lists the course titles of the caller's open appeals; `DangerZoneSection` shows "You have an open refund appeal for <course>; deleting your account closes it." before confirming | The page serves instructors too | — |
| W13 | AC-F27 (instructor who deleted their account) and AC-F29 (streak after a refund) are verified by tests, not changed: instructor anonymisation keeps `stripe_account_id`, and study minutes were archived in slice 3 | Existing behaviour; the plan only proves it | — |

**Codebase anchors (verified during planning):**
- Revenue: procedures `server/api/routers/payment.ts:83-117`; `paymentService.getInstructorEarnings`
  `:197`, `getRevenueSummary` `:237`, `toTransactionStatus` `:300`, `getRecentTransactions` `:310`
  (`server/services/payments/payment.service.ts`); `RevenueSummary` (`server/entities/payment/revenue.ts:16`);
  `getOwedBalance` (`server/repositories/payment.repository.ts:173`); UI
  `app/_components/Instructor/Revenue/**` (cards `components/RevenueSummaryCards/index.tsx:28-36`).
- Release predicate `eligible(now)` and `findReleaseCandidates` (`server/repositories/payout.repository.ts:23-47, 84`).
- Checkout: `createCheckoutSession` `:41-82`, `finalizeCheckoutForStudent` `:130`, `finalizeCheckout`
  `:142-195` (expand `:158`, two writes `:168, :188`) in `payment.service.ts`; success page
  `/dashboard/checkout/success`.
- Refund pieces: `refundAtStripe` (`server/services/refund/refund.service.ts:263-295`), `refundEffectsService.apply`
  (`refundEffects.service.ts:25`), `applyInTx` (`refundEffects.repository.ts:30-100`, `otherPaid` `:68-71`),
  reactivation on repurchase (`server/services/enrollment/enrollment.service.ts:96-110`).
- Events: `stripeEventService.handle` (`stripeEvent.service.ts:47-83`), `chargeRefunded` `:128-166`;
  replay list `REPLAYED_EVENTS` (`payoutJob.service.ts:32-37`); job steps `:177-201`; watchdog
  `payoutWatchdog.service.ts:14`.
- Admin: panel problems (`payoutMonitor.service.ts:89-101`, `payout.dto.ts:53`), refunds page
  `app/(admin)/admin/refunds/**`, audit `refundAudit.repository.ts`, `adminAlert.service.ts`, `sendOnce`.
- Evidence: `refundEvidenceStorage.del` (`server/services/refund/refundEvidenceStorage.ts:40`),
  `RefundEvidenceFile.deletedAt`, appeal `decidedAt`.
- Deletion: `userRepository.anonymiseAccount` (`server/repositories/user.repository.ts:75-170`),
  `userService.anonymiseAccount` (`server/services/user/user.service.ts:31`), hook
  `server/better-auth/accountDeletion.hooks.ts:16`, UI `app/_components/Account/DangerZoneSection/`.
- Repurchase UI: `PurchaseConfirmDialog` (props `types.ts:9`), callers `CourseDetailEnrollCard:199`,
  `BrowseCourseCard:169`; page `app/dashboard/browse/[courseId]/page.tsx`;
  `findCountingRefundCourseIds` (`refundRequest.repository.ts:198`).
- Tests: `payment.service.test.ts` / `.integration.test.ts`, `user.repository.integration.test.ts:607`,
  `dashboardRefundNotice.integration.test.ts` (event and caller patterns), factories in `test/factories.ts`.

**Per-task conventions:** as earlier slices; integration runs never overlap; `stripeEvent.service.test.ts`
gets a mock entry for every new collaborator.

---

## Task 1 — Schema: fee, refunded amount, bank failure, new enum values (W1)

`code included: migration (additive columns and enum values)`

- **Contract:** migration `20261129120000_refund_rest`:
  ```sql
  ALTER TYPE "RefundSource" ADD VALUE IF NOT EXISTS 'duplicate_charge';
  ALTER TYPE "CertificateRevocationReason" ADD VALUE IF NOT EXISTS 'duplicate_charge';
  ALTER TYPE "AppealStatus" ADD VALUE IF NOT EXISTS 'closed_account_deleted';
  ALTER TYPE "RefundAuditKind" ADD VALUE IF NOT EXISTS 'bank_failure_refunded_elsewhere';
  ALTER TYPE "RefundAuditKind" ADD VALUE IF NOT EXISTS 'bank_failure_sale_stands';
  ALTER TABLE "payments" ADD COLUMN "stripe_fee_cents" INTEGER,
    ADD COLUMN "refunded_amount_cents" INTEGER,
    ADD COLUMN "bank_failure_at" TIMESTAMP(3);
  ```
  `RefundEffectPath` gains `duplicate_charge`; the effects' revocation map and the view types follow.
- **Test:** `server/repositories/refundRestSchema.integration.test.ts` — the columns and enum values
  round-trip; the existing refund suites stay green.
- **Files:** `prisma/schema/payments.prisma`, `prisma/schema/refund.prisma`, `prisma/schema/enrollment.prisma`,
  the migration, `server/entities/refund/refund.dto.ts`, `server/services/refund/refundEffects.service.ts`
- **AC:** — (enables the tasks below)
- **Commit:** `feat(refund): fee, refunded amount and bank failure columns`

- [ ] Failing test · [ ] FAIL · [ ] Migration applied to local and `learnix_test` · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — Every payment records its Stripe fee (W2)

- **Contract:** `finalizeCheckout` stores `stripe_fee_cents` from the expanded balance transaction; a
  missing or failing read stores NULL and the checkout succeeds; the payout job's new step fills up to
  50 missing fees per run (payments since day 0) and counts them in the run.
- **Test:** `server/services/payments/stripeFee.integration.test.ts` — fee stored equal to the balance
  transaction's `fee`; retrieve of the balance transaction throws → checkout succeeds, fee NULL; the job
  fills it on its next run; a payment before day 0 is not filled.
- **Files:** `server/services/payments/payment.service.ts`, `server/repositories/payment.repository.ts`,
  `server/services/payments/payoutJob.service.ts`
- **AC:** AC-F28, FR-P28
- **Commit:** `feat(refund): record the Stripe fee of every payment`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — A partial Dashboard refund is recorded; a later refund shows the remainder (W3)

- **Contract:** `chargeRefunded` writes `refunded_amount_cents = amount_refunded` (partial and full);
  the page facts carry the remainder; the form, the "Refunded" note and `refund.done` show it.
- **Test:** `server/services/refund/partialRefund.integration.test.ts` — a partial event records the
  amount, leaves status, access and the share; the page form shows `amount − refunded`; a request then
  refunds (mocked Stripe called with no amount) and the "Refunded" state and email show the remainder;
  the share is cancelled (AC-F15).
- **Files:** `server/services/payments/stripeEvent.service.ts`, `server/repositories/payment.repository.ts`,
  `server/services/refund/refund.service.ts`, `refundView.ts`, `refundNotifications.service.ts`,
  `stripeEvent.service.test.ts`
- **AC:** AC-F15, FR-P16, EC-19
- **Commit:** `feat(refund): record partial refunds and show the remainder`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 4 — A double charge is refunded at once (W4)

- **Contract:** under a per-(student, course) advisory lock, `finalizeCheckout` detects another
  succeeded unrefunded payment for the course; the later payment is never set `pending` for transfer,
  is refunded through `refundAtStripe` and effects on path `duplicate_charge`, emails
  `refund.duplicate-charge` once, and `finalizeCheckoutForStudent` reports `duplicate: true` so the
  success page shows the FR-P17 text.
- **Test:** `server/services/payments/doubleCharge.integration.test.ts` — sequential second finalize →
  refunded, course kept, not counted (D3, account limit); two concurrent finalizes of two sessions →
  one kept, one refunded, the refunded one never had `transferStatus = pending` (AC-C13); one email;
  the success page state says "charged twice".
- **Files:** `server/services/payments/payment.service.ts`, `server/repositories/payment.repository.ts`,
  `server/services/refund/refundNotifications.service.ts`, email template, the success page component
- **AC:** AC-F16, AC-C13, FR-P17
- **Commit:** `feat(refund): refund a double charge at once`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — A refund failed at the bank restores access and holds the share (W5)

- **Contract:** `charge.refund.updated` with status `failed` on a refunded payment (webhook and
  replay) sets `bank_failure_at` once, reactivates the enrollment without restoring cleared records,
  sets the share back to `pending`, and the release predicate excludes payments with `bank_failure_at`;
  the student (`refund.bank-failed`) and the admins (`admin.bank-failure`) are told once.
- **Test:** `server/services/payments/bankFailure.integration.test.ts` — after an applied refund, the
  failed event reactivates the enrollment (records still cleared), sets the share pending, and the
  payment is not claimed for release even past the window; a replayed event changes nothing more;
  emails once each; a non-failed `charge.refund.updated` does nothing.
- **Files:** `server/services/payments/stripeEvent.service.ts`, `server/services/payments/payoutJob.service.ts`
  (replay list), `server/repositories/payout.repository.ts`, `server/repositories/payment.repository.ts`,
  `server/services/enrollment/enrollment.service.ts` (reactivation helper), notices + templates,
  `stripeEvent.service.test.ts`
- **AC:** AC-F17 (first half), FR-P27, FS-3
- **Commit:** `feat(refund): a refund failed at the bank restores access`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — The admin closes a bank failure with an audited outcome (W6)

- **Contract:** `refundAdmin.listBankFailures` and `refundAdmin.resolveBankFailure({ paymentId, outcome,
  note })` (admin-only, note required); "refunded another way" → share `cancelled`; "the sale stands" →
  payment `succeeded`, refund fields cleared, share follows the release rule; one audit row each;
  `bank_failure_at` cleared. The admin refunds page lists them with the two actions.
- **Test:** `server/api/routers/bankFailureAdmin.integration.test.ts` — both outcomes and their share
  state; the sale-stands payment is claimed for release after the window; one audit row; STUDENT /
  INSTRUCTOR FORBIDDEN; a second resolution CONFLICT; UI utils test for the labels.
- **Files:** `server/api/routers/refundAdmin.ts`, `server/services/refund/refundAppealAdmin.service.ts`,
  repositories, `app/(admin)/admin/refunds/_components/BankFailureList/**`, `page.tsx`
- **AC:** AC-F17 (second half), AC-C17, AC-C18
- **Commit:** `feat(refund): the admin resolves a bank failure`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — The instructor sees two held amounts and nothing about refunds (W7, W8, W13)

- **Contract:** `payoutRepository.heldForInstructor(instructorId, now)` returns `{ onHoldCents,
  waitingForStripeCents }` from the release predicate; `RevenueSummary` carries both instead of
  `pendingCents`; the Revenue cards show "On hold until the refund window closes" and "Waiting for Stripe
  connection"; a refunded sale is in neither and not in "Paid Out".
- **Test:** `server/services/payments/instructorHeld.integration.test.ts` — a sale in the window → on
  hold; past the window with no payouts enabled → waiting for Stripe; an open appeal past the window →
  on hold; a refunded sale → neither; revenue responses identical with and without an open appeal apart
  from the held amounts (AC-C19); an instructor who deleted their account keeps `stripe_account_id` and
  the held share is released to it (AC-F27). Contract:
  `server/services/_shared/conformance/instructorRefundIsolation.contract.test.ts` — no instructor-facing
  module or instructor email template references refund requests, appeals, evidence or reasons.
- **Files:** `server/repositories/payout.repository.ts`, `server/services/payments/payment.service.ts`,
  `server/entities/payment/revenue.ts`, `app/_components/Instructor/Revenue/components/RevenueSummaryCards/**`,
  `payment.service.test.ts`
- **AC:** AC-F12, AC-C19, AC-F27, FR-I1–I3
- **Commit:** `feat(refund): the instructor's held amounts`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — A repurchase after a counting refund is warned; during a dispute it is refused (W9)

- **Contract:** the course page and the browse grid compute `repurchaseNotRefundable` (flag on,
  counting refund of the course) and pass it to `PurchaseConfirmDialog`, which shows the FR-S23 text;
  `createCheckoutSession` refuses while an earlier payment of the course has an open dispute.
- **Test:** `server/services/refund/repurchase.integration.test.ts` — the fact is true after an
  automatic refund and after a lost dispute, false after an exception or a Dashboard refund (AC-F7),
  false with the flag off; checkout refused with an open dispute; `PurchaseConfirmDialog/utils.test.ts`
  for the text.
- **Files:** `app/dashboard/browse/[courseId]/page.tsx`, `app/dashboard/browse/page.tsx` (or the
  service behind them), `CourseDetailEnrollCard`, `BrowseCourseCard`, `PurchaseConfirmDialog/**`,
  `server/services/payments/payment.service.ts`
- **AC:** AC-F7, FR-S22, FR-S23, EC-17
- **Commit:** `feat(refund): warn a repurchase after a counting refund`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — Evidence is deleted 30 days after the decision (W10)

- **Contract:** `refundEvidenceRetention.deleteExpired(now)` (called by the watchdog) deletes up to 100
  files of appeals decided ≥ 30 days ago — blob, then `deleted_at`; a failed blob delete leaves the row
  for the next run; open appeals and newer decisions are untouched; texts, snapshot and audit stay.
- **Test:** `server/services/refund/evidenceRetention.integration.test.ts` — day 29 nothing, day 30
  deleted; an open appeal's files untouched; a blob error keeps the row; the download route then 404s.
- **Files:** `server/services/refund/evidenceRetention.service.ts`, `server/repositories/refundAppeal.repository.ts`,
  `server/services/payments/payoutWatchdog.service.ts`
- **AC:** AC-F18, FR-P22
- **Commit:** `feat(refund): delete evidence 30 days after the decision`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 10 — Account deletion erases refund text and files, closes an open appeal (W11, W12)

- **Contract:** `anonymiseAccount` blanks the student's request text, appeal text and file names and
  closes an open appeal `closed_account_deleted` in its transaction; `userService.anonymiseAccount`
  then deletes the student's evidence blobs and marks them deleted; a processing refund still
  completes; `refund.openAppeals` feeds the warning in `DangerZoneSection`.
- **Test:** `server/repositories/user.repository.integration.test.ts` (extend) — texts empty, file names
  `"deleted"`, open appeal closed with no approval, snapshot numbers and audit rows unchanged (AC-C29);
  `server/services/user/accountDeletionRefund.integration.test.ts` — blobs deleted after commit, a
  processing refund completes on the next retry, the share is released normally (EC-12);
  `refund.openAppeals` lists the open appeal's course for the student, `[]` for an instructor and with the
  flag off; `DangerZoneSection` warning text in `utils.test.ts`.
- **Files:** `server/repositories/user.repository.ts`, `server/services/user/user.service.ts`,
  `server/api/routers/refund.ts`, `server/services/refund/refund.service.ts`,
  `app/_components/Account/DangerZoneSection/**`
- **AC:** AC-F20, AC-C29, FR-P23, EC-12, slice-1 accepted item (closed)
- **Commit:** `feat(refund): account deletion erases refund text and files`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 11 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains W1–W13; `security.md` slice-9 status (C19, C29, the slice-1
  item closed); the Release checklist updated; `spec.md` stays `in-progress` until `/qa` flips it to
  `stable` with the whole feature.
- **Commit:** `docs(refund): record slice-9 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030. Code is included only
for the migration (Task 1).

## Self-review

| AC / control | Task | Covered |
|---|---|---|
| AC-F7 | 8 | Warning by counting definition; dispute refusal |
| AC-F12 | 7 | Two held amounts from the predicate |
| AC-F15 | 3 | Partial recorded; remainder refunded and shown |
| AC-F16 / AC-C13 | 4 | Duplicate refunded at once, never pending, not counted |
| AC-F17 | 5, 6 | Reactivation, hold, two audited outcomes |
| AC-F18 | 9 | 30 days after the decision |
| AC-F20 / EC-12 | 10 | Warning, closed appeal, processing refund completes |
| AC-F27 | 7 | Verified by test (W13) |
| AC-F28 | 2 | Fee stored; failure tolerated; filled by the job |
| AC-F29 | — | Covered in slice 3 (study archive); re-checked at `/qa` |
| AC-C19 | 7 | Contract test + identical responses |
| AC-C29 | 10 | Texts, names, files erased; numbers and audit kept |
| AC-C17 / C18 | 6 | Bank-failure outcomes admin-only and audited |

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green; the migration
  applied to local `learnix` and `learnix_test`.
- Break-it: remove the advisory lock → the concurrent double-charge test red; drop the bank-failure line
  from the predicate → Task 5 red; reference `refundAppeal` in an instructor component → the C19 contract
  red.
- Manual, flag on, Stripe CLI: a partial Dashboard refund then a request shows the remainder; two tabs
  buying the same course → one refunded, "charged twice" on the success page; the instructor Revenue
  page shows the two held amounts; deleting an account with an open appeal shows the warning.
