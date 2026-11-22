# Refund self-service — Slice 5: payout monitoring — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session (ADR-030).
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Earlier slices: [`plan.md`](plan.md), [`plan-slice-2.md`](plan-slice-2.md),
> [`plan-slice-3.md`](plan-slice-3.md), [`plan-slice-4.md`](plan-slice-4.md).

**Goal:** The admin can see whether payouts are working — last run, history, held funds, problem
payments with "Retry" — and is emailed when a run fails, when no run has succeeded for 48 h, and
when a student's refund is still processing after 3 days (the student is emailed too).

**Architecture:** Every scheduled or manual run writes its `PayoutRun` row at the start and finishes
it at the end; a run that crashes keeps `finishedAt = null` and its `error`. A read-model service
assembles the panel (FR-A8). An alert service emails every admin, de-duplicated through
`notificationLog` (FR-A10, FR-A11). A second daily cron route, the watchdog, checks for 48 h without
success and for refunds overdue by 3 days, so the alert does not depend on the release run itself.

**Spec:** [`../spec.md`](../spec.md) FR-A8, FR-A9 (done in slice 2), FR-A10, FR-A11, FS-1, FS-5,
FS-14; [`../security.md`](../security.md) C15 (cron secret, reused by the watchdog), C16, C17
(admin-only procedures), C23 (no Stripe text to the student);
[ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md) §3.5–§3.7.

**Track:** `pnpm classify` → **guarded**: a new route handler (watchdog), new admin procedures, a
migration. Each control gets its own test; `security-auditor` audits at `/qa`. No AI surface.

### Scope of this slice

**In:** run lifecycle (start / finish / crash), the Payouts panel at `/admin/payouts` (status with
the 48 h warning, history, held funds, problem payments with Retry), admin emails for a failed run
and for 48 h without success, the day-3 refund reminder (admin + student), the watchdog cron.

**Out:** refund failed at the bank in the problem list (FR-P27, slice 9); the Dashboard-refund admin
email (FR-A7, slice 8); an admin navigation menu (a link from `/admin` is enough here); the audit log
of admin actions (C18, slice 8).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| M1 | A run row is created when the run starts and finished when it ends; a throw finishes it with `error` and rethrows; a row still unfinished 15 min after start (the lock TTL) counts as crashed | Today a crashed run leaves no row at all, so "failed" is invisible | What "a run fails" means (FR-A10) |
| M2 | **Successful run** = a `cron` or `manual` run that finished without `error`. Per-payment failures do not make a run failed — they appear as problem payments | FR-A10 is about the job stopping; failing payments are the panel's job, or every flaky transfer would email | Success definition |
| M3 | A second daily cron, `GET /api/cron/payout-watchdog` (same `CRON_SECRET` check), sends the 48 h alert and the day-3 reminders; the panel shows the 48 h warning on every load | The release run cannot report its own absence. Residual risk: if Vercel Cron itself stops, both routes stop — the panel warning is the backstop | Who notices 48 h without success |
| M4 | Admin emails go to every user with role `ADMIN`; no new env var | No admin-email setting exists; admins are already in the DB | Recipients |
| M5 | De-dup through `notificationLog` (keys below); a failed send deletes its key so the next check retries | `tryLog` before `send` would otherwise burn the key on a Resend error | — |
| M6 | Alert keys: failed run — per admin per run id; 48 h — per admin per UTC day; day-3 — student per request, admin per admin per request | One email per incident, one 48 h email a day while it lasts | Frequency |
| M7 | The day-3 clock starts at the request's `createdAt` (the automatic approval is made at submission) | FR-A11 "3 days after approval" | Approval time |
| M8 | Problem payments: refunds `processing` for ≥ 3 days (Retry → `executeRefund`), payments `transferring` for over 15 min (Retry → release that payment), refunded payments whose released share is not yet reversed (Retry → reversal); the last run's failure list is shown read-only | These are the three states an admin can act on today; bank failures come with FR-P27 | "Problem payments" |
| M9 | Held funds = sum of the instructor's net over `succeeded` payments with `transferStatus = pending`: total, and due in the next 7 days by `releaseEligibleAt` | FR-A8 "total and due in the coming days" | "Coming days" = 7 |
| M10 | Every admin email and the student's day-3 email are `CRITICAL` (no unsubscribe) and carry no Stripe text | Operational and money notices; C23 | Template class |

Each is logged in `discovery/ai-decision-log.md` in Task 9. The day-3 reminders live only in the
watchdog (Task 5), so the release run stays about money.

**Codebase anchors (verified during planning):**
- Email: `emailService.send({ templateKey, toEmail, userId?, payload })` (`server/services/email/email.service.ts:28`), opt-out skipped for `CRITICAL` (`:34`); registry `emailTemplates` with `{ component, payload: z.ZodSchema, subject, criticality }` (`server/services/email/email.templates.ts:15-20,22-136`); components in `app/_emails/` with shared `EmailLayout` / `EmailButton` (`app/_emails/_shared/`); example `app/_emails/EngagementNearCompletionEmail.tsx` (uses `export function` + inline props — new templates follow CLAUDE.md instead).
- De-dup: `notificationLogRepository.tryLog({ dedupKey, userId, automation, payload? })` → `{ created }` (`server/repositories/notificationLog.repository.ts:16`), `deleteByDedupKey` (`:43`); pattern in `server/services/notifications/notification.service.ts:31-36`. `NotificationLog.userId` is a required FK (`prisma/schema/notification.prisma`).
- Admin UI: layout guards `ADMIN` (`app/(admin)/layout.tsx:6-20`); `/admin` page with the Operations block (`app/(admin)/admin/page.tsx:26,54-57`); client mutation pattern `app/(admin)/admin/_components/RunPayoutJobButton/`; primitives `table.tsx`, `card.tsx`, `badge.tsx`, `button.tsx` in `app/_components/_shared/ui/`; `formatPrice` (`lib/formatPrice`).
- Runs: `PayoutRun` (`prisma/schema/payments.prisma:88-104`, no status/error); `payoutRunRepository.record` (`server/repositories/payoutRun.repository.ts:17`); `payoutJobService.run` (`server/services/payments/payoutJob.service.ts:170-202`) and `releaseAndRecord` (`:134`), `retryRefunds` (`:60-74`), `PAYOUT_LOCK_TTL_MS`.
- Payout reads: `payoutRepository` (`server/repositories/payout.repository.ts`) — `eligible` (`:22-40`), `findReleaseCandidates` (`:77`), `findRefundedTransferred` (`:134`); `releaseEligibleAt` (`server/services/payments/payoutRules.ts:20`); `connectService.releasePayment` / `reverseTransfer`; `refundService.executeRefund`; `refundRequestRepository.findProcessingIds` (`server/repositories/refundRequest.repository.ts:144`).
- Admin router: `getPlatformRevenue` / `runPayoutJobNow` (`server/api/routers/payment.ts:129,142`); `adminProcedure` (`server/api/trpc.ts:235`); role-guard test pattern (`server/api/routers/payment.integration.test.ts:34-90`).
- Cron: `app/api/cron/release-payouts/route.ts` with `bearerMatches` (`server/services/notifications/auth.ts`), `vercel.json` (one cron).
- Email mocking with call assertions: `vi.mock(..., async (importOriginal) => ({ ...(await importOriginal()), emailService: { send: vi.fn() } }))` (`server/services/auth/auth.service.integration.test.ts:34`).

**Per-task conventions:** as earlier slices; components arrow-function, one per folder, props in
`types.ts`, pure helpers in `utils.ts` with unit tests (`componentConventions.contract.test.ts`).

---

## Task 1 — Schema: a run's error

- **Contract:** `PayoutRun.error String?` — the message of a run that threw (M1).
- **Test:** `server/repositories/payoutRunSchema.integration.test.ts` — round-trips `error` and an
  unfinished row.
- **Files:** `prisma/schema/payments.prisma`, migration `20261126120000_payout_run_error`.
- **Commit:** `feat(refund): schema for a payout run's error`

- [ ] Failing test · [ ] FAIL · [ ] Schema + migration · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — Run lifecycle: started, finished, crashed

- **Contract:** `payoutJobService.run` creates its row right after taking the lock (`finishedAt` null),
  finishes it with the counts, or — on a throw — finishes it with `error` and rethrows (M1).
  `payoutRunRepository` gains `start`, `finish`, `fail`, `findLatest`, `findLastSuccessful` (M2),
  `findHistory(limit)`.
- **Test:** `payoutJob.service.integration.test.ts` — a normal run leaves one finished row; a run
  whose candidate query throws leaves a row with `error` and rethrows; `findLastSuccessful` ignores
  `account_updated` runs and failed runs.
- **Files:** `payoutJob.service.ts`, `payoutRun.repository.ts`, test.
- **AC:** FR-A10 (prerequisite), AC-F11 (history).
- **Commit:** `feat(refund): payout runs record their start, finish and crash`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — Admin alert service and email templates

- **Contract:** `adminAlertService`:
  - `runFailed(run)` — one email per admin per run id (M6);
  - `checkStale(now)` — if the last successful run (M2) is older than 48 h, or none exists while
    payments are held, one email per admin per UTC day;
  - `refundOverdue(request)` / `remindStudent(request)` — day-3 emails (FR-A11).
  All de-dup through `notificationLog`; a failed send deletes its key (M5). Templates
  `admin.payout-run-failed`, `admin.payout-stale`, `admin.refund-overdue`,
  `refund.still-processing` — `CRITICAL`, no Stripe text (M10, C23).
- **Test:** `server/services/payments/adminAlert.service.integration.test.ts` (email mocked with call
  assertions) — two admins → two emails, a second call → none; a send failure → the next call
  retries; stale only past 48 h; the student email's payload has no error text;
  `server/services/email/payoutTemplates.test.ts` — each new template renders with its preview props.
- **Files:** `server/services/payments/adminAlert.service.ts`, `server/repositories/user.repository.ts`
  (`findAdmins`), `server/services/email/email.templates.ts`, `app/_emails/PayoutRunFailedEmail/`,
  `app/_emails/PayoutStaleEmail/`, `app/_emails/RefundOverdueEmail/`, `app/_emails/RefundStillProcessingEmail/`
  (each `index.tsx` + `types.ts`), tests.
- **AC:** FR-A10, FR-A11, AC-F23 (emails), C23.
- **Commit:** `feat(refund): admin payout alerts and the refund-processing reminder`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 4 — A failed run emails the admins

- **Contract:** when `run` throws (after recording `error`), `adminAlertService.runFailed` is called
  before the rethrow; an email failure never masks the run's own error.
- **Test:** `payoutJob.service.integration.test.ts` — a crashing run → one email per admin; a run with
  per-payment failures → none (M2).
- **Files:** `payoutJob.service.ts`, test.
- **AC:** FR-A10 (failure), AC-F30 (job email part), FS-5.
- **Commit:** `feat(refund): a failed payout run emails the admins`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — The watchdog: 48 h without success and overdue refunds

- **Contract:** `payoutWatchdogService.check(now)` calls `checkStale(now)` and, for every refund
  `processing` since ≥ 3 days (M7), `refundOverdue` + `remindStudent` once each.
  `GET /api/cron/payout-watchdog` runs it behind the same `CRON_SECRET` check as the release route
  (empty 401, counts only); `vercel.json` schedules it daily at a different hour (M3).
- **Test:** `payoutWatchdog.service.integration.test.ts` — last success 49 h ago → alert; 47 h → none;
  a refund processing 3 days → one admin + one student email, the next day nothing new;
  `app/api/cron/payout-watchdog/route.test.ts` — the AC-C15 cases (no header, wrong secret, other
  length, short secret → empty 401, nothing runs).
- **Files:** `server/services/payments/payoutWatchdog.service.ts`, `app/api/cron/payout-watchdog/route.ts`,
  `vercel.json`, tests.
- **AC:** FR-A10 (48 h), FR-A11, AC-F23 (day-3 emails), C15 (reused), FS-14.
- **Commit:** `feat(refund): a watchdog cron for stale payouts and overdue refunds`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — The Payouts panel read model

- **Contract:** `payoutMonitorService.getStatus(now)` returns: the last run and outcome, `stale`
  (no success for 48 h, M2), the last 20 runs, held funds (total and due within 7 days, M9), and the
  three problem lists of M8 (ids, amounts, ages, admin-only error text), plus the last run's failures.
- **Test:** `payoutMonitor.service.integration.test.ts` — each figure on seeded data: a crashed run
  counts as failed; held funds exclude refunded and transferred payments; each problem list contains
  exactly its state.
- **Files:** `server/services/payments/payoutMonitor.service.ts`, `server/repositories/payout.repository.ts`
  (held sums, problem queries), `server/entities/payout/payout.dto.ts` (panel DTO), test.
- **AC:** AC-F11 (data), FR-A8.
- **Commit:** `feat(refund): the payouts panel read model`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — Admin procedures: status and Retry

- **Contract:** `payment.getPayoutStatus` (query) and `payment.retryRefund({ requestId })`,
  `payment.retryRelease({ paymentId })`, `payment.retryReversal({ paymentId })` (mutations) — all
  `adminProcedure` (C17). Retry release runs `releasePayment` for that one payment with no run row;
  each returns the outcome kind only.
- **Test:** `server/api/routers/payoutAdmin.integration.test.ts` — STUDENT and INSTRUCTOR → FORBIDDEN
  on all four, nothing changes; ADMIN → status shape; each retry acts on its state (refund refunded,
  transferring released, reversal made).
- **Files:** `server/api/routers/payment.ts`, `payoutJob.service.ts` (`retryRelease`), test.
- **AC:** AC-F11 (Retry), C17.
- **Commit:** `feat(refund): admin payout status and retry procedures`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — The Payouts page

- **Contract:** `/admin/payouts` (RSC) shows: a status card (last run, outcome, a warning when
  `stale`, "Run job now"), held funds, problem payments with a Retry button per row, and run history.
  `/admin` links to it from Operations. Components, one per folder under
  `app/(admin)/admin/payouts/_components/`: `PayoutStatusCard`, `HeldFundsCard`,
  `ProblemPaymentsTable`, `RetryButton` (owns its mutation, refreshes the page), `RunHistoryTable`.
  Formatting helpers in `utils.ts`.
- **Test:** `app/(admin)/admin/payouts/_components/*/utils.test.ts` — outcome labels, age and the
  stale message; render is verified manually (no component-test harness for admin pages).
- **Files:** the page and the components above; `app/(admin)/admin/page.tsx` (link).
- **AC:** AC-F11 (display), FR-A8.
- **Commit:** `feat(refund): the admin payouts page`

- [ ] Failing tests (utils) · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains M1–M10 and where the code differed; `security.md` slice-5
  status (C15 watchdog, C17, C23) and the residual risk of M3; the slice-3 "poison event" risk notes
  that the panel now surfaces a stuck replay through the run history; `spec.md` stays `in-progress`.
  Deploy note: the second cron in `vercel.json`.
- **Commit:** `docs(refund): record slice-5 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

Contracts and test names are enough to execute from; the executor is the model that wrote the plan
(ADR-030). No task here puts money at risk in a way whose exact code needs approval, so no code is
included.

## Self-review

| AC | Task | Covered |
|---|---|---|
| AC-F11 | 2, 6, 7, 8 | Full: last run, history, problem payments with Retry, held funds; "Run job now" (slice 2) on the same page |
| AC-F23 | 3, 5 | Day-3 student email and admin reminder; a refund that succeeds earlier sends neither (the query reads `processing` only). Page text → slice 7 |
| AC-F30 | 4 | Failed job run sends the admin email |
| C15 | 5 | Watchdog route reuses the cron-secret check, with its own route test |
| C17 | 7 | Every new procedure admin-only, with a denial test per role |
| C23 | 3 | The student's email carries no Stripe text |

**Deferred:** bank-failure problems (FR-P27), the Dashboard-refund email (FR-A7), the admin audit log.

**Contract consistency:** `findLastSuccessful` (Task 2) is used by Tasks 3, 6; `adminAlertService`
(Task 3) by Tasks 4, 5; `getStatus` (Task 6) by Tasks 7, 8; `retryRelease` (Task 7) by Task 8.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Manual: as admin open `/admin/payouts` → status, held funds and history render; force a failing
  run (stop the DB connection in dev or throw from a test hook) → the run shows failed and the admin
  email arrives in the Resend log; `curl` the watchdog without a secret → empty 401.
- Before deploy: the second cron in Vercel; at least one `ADMIN` user exists to receive alerts.
