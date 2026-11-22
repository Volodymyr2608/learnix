# Refund self-service — Slice 2: hold and release — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Slice 1 (automatic decision) is in [`plan.md`](plan.md).

**Goal:** A sale no longer pays the instructor at once. The instructor's net is held on the platform
and released by one release function, under one eligibility predicate, from a daily cron, the admin
"Run job now" action and the `account.updated` sweep — at most once per payment.

**Architecture:** ADR-037 §1–§3. One pure module states the window and appeal-deadline arithmetic.
One repository method claims a payment with a single conditional `UPDATE … SET transfer_status =
'transferring'` that carries the whole predicate (C5). One service function, `releasePayment`, is the
only caller of `stripe.transfers.create`: it checks the live account and charge, lists transfers by
`transfer_group` before creating one (C7), and creates it with an idempotency key. A job wraps it:
a Redis run lock (C16), a batch of 50 selected by state, a `PayoutRun` record (FR-P5). The cron
route authenticates with `CRON_SECRET` in constant time (C15). The transfer at sale, the old Sweep
procedure and the direct `account.updated` sweep are removed (C14).

**Spec:** [`../spec.md`](../spec.md) FR-P1–P5, FR-P2a, FR-P24–P26; [`../security.md`](../security.md)
C5, C6, C7, C14, C15, C28 (+ AC-C16, run lock); [ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md) §1–§3.

**Track:** `pnpm classify` on 2026-11-22 → **guarded**: database migration, new environment
variable, money path (`payment.service.ts`, `connect.service.ts`). Each control above gets its own
test in the task that owns the code. `security-auditor` runs in audit mode at `/qa` over the changed
routes, routers, services and repositories. No AI surface is touched — `llm-security-auditor` not
needed.

### Scope of this slice

**In:** FR-P1 (no transfer at sale), FR-P2/P2a (one predicate, every path), FR-P3 (daily job, batch
50, `transferring` retry), FR-P4 (at most once: CAS + idempotency key + list-before-retry for
transfers), FR-P5 (run record), FR-P24 (one release function), FR-P25 (cron secret), FR-P26
(checkout status bound to its student), "Run job now" replacing Sweep, `vercel.json`.

**Out (later slices):** `refunds.create` and every refund effect incl. `pending → cancelled` and the
reversal of a `transferring` payment (FR-P6–P15, slice 3); disputes as stored state (FR-P18, slice 4
— this slice uses the live charge check only); admin failure / 48 h email and the Payouts panel
(FR-A8–A10, slice 5); the instructor's "On hold" view (FR-I1, AC-F12); the fee record (FR-P28,
AC-F28); release to a deleted instructor's retained account (EC-20, AC-F27); event replay (ADR-037 §4).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| H1 | `paidAt` null → eligible at `createdAt` + 24 h + 14 d + 1 h | Legacy sales (before slice 1) have no `paidAt` and must still be paid; a new sale whose charge was not expanded must not be released early. A Checkout Session expires within 24 h, so `paidAt ≤ createdAt + 24 h` — the bound is always on the safe side | Spec and ADR silent on null `paidAt` for release (slice 1 P4 covered refunds only) |
| H2 | An `auto_approved` request blocks release | Until slice 3 no Stripe refund is made, so an approved request is a refund "processing" (FR-P2a). From slice 3 the payment becomes `refunded` and the status check takes over | FR-P2a assumes a refund state slice 1 does not store |
| H3 | Appeal right = an `auto_denied` request and `now < max(windowEnd, deniedAt + 3 d)` | FR-S16; no appeals table exists yet, so "no appeal filed" is always true in this slice | — (scope cut) |
| H4 | Live charge refunded or disputed at release → back to `pending`, recorded as a run failure; no effects applied | Applying effects is slice 3 (replay); this slice must only refuse to pay | FR-P2a "live charge check" without the effects |
| H5 | A Stripe error after the claim leaves the payment `transferring`; the next run recovers it list-before-retry | ADR-037 §2: never guess whether Stripe created the transfer | — |
| H6 | The migration moves `succeeded` payments with `transferStatus = none` and a net > 0 to `pending` | The removed retry branch in `finalizeCheckout` (`payment.service.ts:137-139`) was their only path to payment | Spec silent on legacy `none` rows |
| H7 | Run lock: Redis `SET NX` with a random token and a 15 min TTL; released by a compare-and-delete script; in-memory fallback when KV is absent, as the AI-limits store already does (`aiLimits/store/index.ts:41,74-75`) | ADR-037 §3.2; C16 "never releases another run's lock" needs the token. 15 min > the 300 s Hobby limit, so a crashed run cannot block the next day | TTL value |
| H8 | `requireBearer` takes the expected secret as a parameter; the cron route passes `CRON_SECRET`, the n8n routes `N8N_API_TOKEN` | One constant-time comparison instead of a copy | — |
| H9 | The checkout success path makes no transfer at all (FR-P2 lists it; the predicate can never hold at sale) | AC-C14: "checkout makes no transfer" | FR-P2 vs AC-C14 wording |

Each is logged in `discovery/ai-decision-log.md` in Task 12.

**Codebase anchors (verified during planning):**
- `stripe.transfers.create` — the **only** caller today (`server/services/payments/connect.service.ts:153`), inside `transferToInstructor` (`:118-165`): no idempotency key, no `transfer_group`, read-then-write with no guard. Live `payouts_enabled` via `stripe.accounts.retrieve` (`:130-138`); charge via `paymentIntents.retrieve(...).latest_charge` (`:142-151`). Stripe client `import { stripe } from "./stripe.client"` (`:6`).
- `sweepPendingTransfers(instructorId)` (`connect.service.ts:167-193`) — loops `pending` rows with no `status` check (the D8 leak). `reverseTransfer` (`:195-209`) stays as is.
- `finalizeCheckout(sessionId)` (`server/services/payments/payment.service.ts:126-184`) — transfers at `:181` and in the retry branch `:137-139`; `paidAt` from `chargeCreatedAt` (`:32-39`, `:156-163`). `handleRefund` (`:186-215`) — unchanged in this slice.
- `getSessionStatus` (`server/api/routers/payment.ts:33-41`) — calls `finalizeCheckout` with **no ownership check** (C28). `sweepAllPendingTransfers` (`:133-147`, `adminProcedure`) — removed.
- Webhook `account.updated` → `connectService.sweepPendingTransfers(profile.userId)` (`app/api/stripe/webhook/route.ts:66-78`); test asserts it at `route.test.ts:26,88`.
- Admin UI: `app/(admin)/admin/SweepButton.tsx` (flat file, `export function`, nested ternary) rendered at `app/(admin)/admin/page.tsx:54-57`.
- `TransferStatus { none pending transferred reversed }` (`prisma/schema/payments.prisma:8-13`); `Payment` indexes only on the three foreign keys (`:44-46`). No `PayoutRun` model. Latest migration `20261122120000_refund_request_slice`.
- `REFUND_WINDOW_MS`, `isInsideRefundWindow` (`server/services/refund/refundRules.ts:9,26-27`) — pure arrow consts, `now` passed in. `RefundRequest` (`prisma/schema/refund.prisma`) with `decision`, `createdAt`, `paymentId @unique`.
- Direct `db.$transaction` rather than `BaseRepository.transaction`, which wraps errors (`server/services/refund/refund.service.ts:38-40`).
- `requireBearer(req)` (`server/services/notifications/auth.ts:8-17`) — `timingSafeEqual` with a length check, hard-wired to `N8N_API_TOKEN`, throws a `Response`; used at `app/api/notifications/inactive-students/route.ts:11-16`.
- `lib/env.js` — server vars at `:35-77`, `runtimeEnv` `:126-162`; tests run with `SKIP_ENV_VALIDATION`, so a production-only rule is also asserted at the point of use (`:59-65`).
- Redis: `createRedisClient` (`server/services/_shared/aiLimits/store/upstash.store.ts:69-77`); `RedisLike` (`:62-67`) has no `set`; tests inject a fake (`upstash.store.test.ts`).
- Tests: Stripe mocked as `vi.mock("./stripe.client", …)` (`connect.service.test.ts:5-32`); local `makePayment` builders list every field (`connect.service.test.ts:84-106`, `payment.service.test.ts:117-139`); `truncateAll` table list (`test/db.ts:6-41`); `makePayment` factory (`test/factories.ts:169-187`, default `transferStatus: "none"`, `paidAt: new Date()`); source-scanning contract test pattern with comment stripping (`server/services/_shared/conformance/aiSurfaces.contract.test.ts:1-17`); route handler unit test (`app/api/invoices/[paymentId]/route.test.ts`).
- `adminProcedure` (`server/api/trpc.ts:235`).

**Per-task conventions:** after the implementation step, `pnpm typecheck` + `pnpm check` clean before
committing; unit tests colocated `*.test.ts`, integration `*.integration.test.ts` on `learnix_test`;
services and repositories export singletons; all functions are arrow consts; new env vars go to
`lib/env.js` (+ `runtimeEnv`), `.env.example`, `.env.test.example`, `.env.test`, and the `@/lib/env`
mocks in the payment unit tests.

---

## Task 1 — Schema: `transferring`, `cancelled`, `PayoutRun`, release index, legacy backfill

- **Contract:** `TransferStatus` is `none | pending | transferring | transferred | cancelled |
  reversed`. A `PayoutRun` row records `startedAt`, `finishedAt`, `trigger` (`cron | manual |
  account_updated`), `processed`, `released`, `failures` (JSON `[{ paymentId, error }]`) and
  `paymentIds` (FR-P5). `payments` has an index on `(transfer_status, paid_at)`. Legacy succeeded
  payments that were never transferred are `pending` (H6).
- **Code included: migration on the money path** — the backfill is the part to approve:
  ```sql
  ALTER TYPE "TransferStatus" ADD VALUE 'transferring';
  ALTER TYPE "TransferStatus" ADD VALUE 'cancelled';
  -- H6: the removed finalizeCheckout retry was the only path that paid these
  UPDATE "payments" SET "transfer_status" = 'pending'
   WHERE "status" = 'succeeded' AND "transfer_status" = 'none'
     AND "instructor_net_cents" > 0 AND "refunded_at" IS NULL;
  ```
  (`ADD VALUE` cannot run in the same transaction as a statement using the new value — the backfill
  uses only `pending`, so one migration is fine.)
- **Test:** `server/repositories/payoutSchema.integration.test.ts` — a payment can be set to
  `transferring` and `cancelled`; a `PayoutRun` row round-trips its JSON failures; `truncateAll`
  empties `payout_runs`.
- **Files:** `prisma/schema/payments.prisma`, `prisma/migrations/20261123120000_payout_hold/migration.sql`
  (generated with `prisma migrate diff`, as in slice 1, then the backfill appended), `test/db.ts`,
  the two unit-test `makePayment` builders if the type changes.
- **AC:** FR-P5 (record), prerequisite for AC-C5/C7.
- **Commit:** `feat(refund): schema for the payout hold and run record`

- [ ] Write the failing test · [ ] Run it, see it FAIL (enum values and table missing) · [ ] Edit schema, generate migration, append backfill, `pnpm generate`, update `test/db.ts`
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 2 — The release arithmetic: `releaseEligibleAt`, `appealDeadline`

- **Contract:** pure arrow functions in `server/services/payments/payoutRules.ts`:
  `releaseEligibleAt(paidAt, createdAt)` = `paidAt + 14 d + 1 h`, or `createdAt + 24 h + 14 d + 1 h`
  when `paidAt` is null (H1); `appealDeadline(windowEndsAt, deniedAt)` = the later of the two after
  adding 3 days to `deniedAt` (FR-S16, H3). Reuse `REFUND_WINDOW_MS`; export `RELEASE_GRACE_MS`,
  `CHECKOUT_MAX_MS`, `APPEAL_GRACE_MS`.
- **Test:** `server/services/payments/payoutRules.test.ts` — at `paidAt + 14 d + 1 h − 1 s` not yet
  eligible, at `+ 14 d + 1 h` eligible; null `paidAt` uses the `createdAt` bound; the appeal deadline
  is the window end when the denial is early and denial + 3 d when it is late.
- **Files:** `server/services/payments/payoutRules.ts`, its test.
- **AC:** AC-C5 (window edge, 1 h margin), AC-C6 (appeal deadline).
- **Commit:** `feat(refund): pure release-window and appeal-deadline rules`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module missing) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 3 — The claim: one conditional update with the full predicate

- **Contract:** `payoutRepository.claimForRelease(paymentId, now): Promise<boolean>` changes
  `pending → transferring` in **one** statement and returns whether it did. The statement carries
  the whole FR-P2a predicate, so no path can claim a payment the predicate forbids:
  `status = 'succeeded'`, `refunded_at IS NULL`, `transfer_status = 'pending'`, `now ≥
  releaseEligibleAt(...)` (H1, as SQL), no `auto_approved` request on it (H2), no `auto_denied`
  request whose `appealDeadline` has not passed (H3). Plus
  `findReleaseCandidates(now, limit)` (eligible `pending` ∪ all `transferring`, oldest `paid_at`
  first, `limit`), `markTransferred(id, transferId)` (CAS `transferring → transferred`) and
  `releaseClaim(id)` (CAS `transferring → pending`).
- **Code included: the claim SQL is the money guard** — the predicate's exact form is what is
  approved (`$queryRaw`, parameters bound, constants from Task 2 passed in as intervals):
  ```sql
  UPDATE payments p SET transfer_status = 'transferring', updated_at = now()
   WHERE p.id = $1 AND p.transfer_status = 'pending'
     AND p.status = 'succeeded' AND p.refunded_at IS NULL
     AND $2 >= COALESCE(p.paid_at, p.created_at + $checkoutMax) + $window + $grace
     AND NOT EXISTS (SELECT 1 FROM refund_requests r WHERE r.payment_id = p.id
           AND (r.decision = 'auto_approved'
                OR (r.decision = 'auto_denied'
                    AND $2 < GREATEST(COALESCE(p.paid_at, p.created_at + $checkoutMax) + $window,
                                      r.created_at + $appealGrace))))
  RETURNING p.id
  ```
- **Test:** `server/repositories/payout.repository.integration.test.ts` —
  - at 14 d − 1 s, and inside the 1 h margin, not claimed; at 14 d + 1 h claimed (AC-C5);
  - `refunded`, `auto_approved` request, `auto_denied` inside its appeal deadline → not claimed;
    `auto_denied` after the deadline → claimed (AC-C6);
  - null `paidAt` claimed only after `createdAt + 24 h + 14 d + 1 h` (H1);
  - two concurrent claims of one payment → exactly one `true` (FR-P4);
  - `findReleaseCandidates` returns `transferring` rows and at most `limit` rows.
- **Files:** `server/repositories/payout.repository.ts`, its test.
- **AC:** AC-C5 (first two clauses), AC-C6, FR-P2a, FR-P4.
- **Commit:** `feat(refund): claim a payment for release in one conditional update`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] Break it on purpose: drop the `NOT EXISTS` clause, see AC-C6 go red, restore
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 4 — `releasePayment`: the one function that transfers

- **Contract:** `connectService.releasePayment(paymentId, now): Promise<ReleaseOutcome>` where
  `ReleaseOutcome` is `released | already_transferred | not_eligible | waiting_for_stripe |
  charge_not_payable | failed` (type in `server/entities/payout/payout.dto.ts`). Sequence:
  1. a `pending` payment is claimed (Task 3); zero rows → `not_eligible`; a `transferring` payment is
     a recovery and skips the claim;
  2. no connected account or live `payouts_enabled` false → `releaseClaim` → `waiting_for_stripe`;
  3. live charge (`charges.retrieve(latest_charge)`) refunded or disputed → `releaseClaim` →
     `charge_not_payable` (H4);
  4. `transfers.list({ transfer_group: payment.id })` finds one → `markTransferred` →
     `already_transferred` (C7);
  5. otherwise `transfers.create({ amount, currency, destination, source_transaction,
     transfer_group: payment.id }, { idempotencyKey: \`transfer:${payment.id}\` })` →
     `markTransferred` → `released`;
  6. a Stripe error in 4–5 leaves `transferring` → `failed` with the message (H5).
  `transferToInstructor` and `sweepPendingTransfers` are deleted.
- **Test:** `server/services/payments/connect.service.test.ts` (Stripe mocked) — each outcome; the
  create call carries the idempotency key and `transfer_group`; an existing transfer in the group →
  no create (AC-C7); a Stripe error → status stays `transferring`; a `transferring` payment is not
  re-claimed.
- **Files:** `server/services/payments/connect.service.ts`, `server/entities/payout/payout.dto.ts`,
  the test.
- **AC:** FR-P4, AC-C7 (transfers), FR-P24.
- **Commit:** `feat(refund): one release function with list-before-retry`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 5 — Run lock

- **Contract:** `runLock.acquire(name, ttlMs): Promise<string | null>` returns a random token or
  `null` if held; `runLock.release(name, token)` deletes the key only if it still holds that token
  (compare-and-delete script). Redis via `createRedisClient` with `RedisLike` extended by `set`; an
  in-memory implementation when KV is absent outside production (H7).
- **Test:** `server/services/payments/runLock.test.ts` (fake `RedisLike`, as in
  `upstash.store.test.ts`) — second acquire while held → `null`; release with a stale token leaves the
  newer holder's lock in place (AC-C16); after TTL the lock can be taken again.
- **Files:** `server/services/payments/runLock.ts`, `server/services/_shared/aiLimits/store/upstash.store.ts`
  (`RedisLike` gains `set`), the test.
- **AC:** AC-C16.
- **Commit:** `feat(refund): token-checked run lock for the payout job`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 6 — The payout job

- **Contract:** `payoutJobService.run({ trigger, now }): Promise<PayoutRunSummary>` — acquires the
  run lock (busy → `{ status: "already_running" }`, nothing claimed); takes up to **50** candidates
  (FR-P3); calls `releasePayment` for each, never stopping on one failure; writes one `PayoutRun`
  with counts, failures with error text and payment ids (FR-P5); releases its own lock in `finally`.
  `payoutJobService.releaseForInstructor(instructorId, now)` releases that instructor's `pending`
  payments through the same `releasePayment` (the `account.updated` path) and records a run with
  `trigger: account_updated`.
- **Test:** `server/services/payments/payoutJob.service.integration.test.ts` (Stripe mocked, lock
  faked) — 51 eligible → first run releases 50, second run the last one (AC-F25); a run with one
  failing payment releases the rest and records the failure; lock held → `already_running`, no row
  changes (AC-C16); `releaseForInstructor` skips a held sale of that instructor (FR-P2).
- **Files:** `server/services/payments/payoutJob.service.ts`, `server/repositories/payoutRun.repository.ts`, the test.
- **AC:** AC-F25, AC-C16, FR-P3, FR-P5.
- **Commit:** `feat(refund): daily payout job with batch, run record and lock`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 7 — Cron endpoint and `CRON_SECRET`

- **Contract:** `GET /api/cron/release-payouts` runs the job with `trigger: cron` only for
  `Authorization: Bearer <CRON_SECRET>`, compared in constant time (`requireBearer(req, secret)`,
  H8). Anything else → status 401 with an **empty body**, job not called. 200 returns only counts
  (`processed`, `released`, `failed`, or `already_running`), no payment ids. `CRON_SECRET` is
  `z.string().min(32)` in `lib/env.js`, and the route also refuses to run when it is shorter than 32
  characters (validation is skipped in tests). `vercel.json` schedules the route daily.
- **Test:** `app/api/cron/release-payouts/route.test.ts` (job mocked) — no header, wrong secret,
  secret of another length → 401, empty body, job not called; correct secret → 200 with counts and no
  `paymentIds` key; a 31-character secret → refused. `server/services/notifications/auth.test.ts`
  (new or extended) — the n8n routes still accept `N8N_API_TOKEN`.
- **Files:** `app/api/cron/release-payouts/route.ts`, `server/services/notifications/auth.ts` (+ its
  two callers), `lib/env.js`, `.env.example`, `.env.test.example`, `.env.test`, `vercel.json`, tests.
- **AC:** AC-C15, FR-P25.
- **Commit:** `feat(refund): cron endpoint for the payout job behind CRON_SECRET`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 8 — Remove the early-payout paths

- **Contract:** `finalizeCheckout` makes no transfer: after the split it sets `transferStatus =
  pending`; the retry branch (`payment.service.ts:137-139`) no longer transfers (H9). The webhook's
  `account.updated` calls `payoutJobService.releaseForInstructor`. `payment.sweepAllPendingTransfers`
  is replaced by `payment.runPayoutJobNow` (`adminProcedure`, `trigger: manual`; `already_running` →
  `CONFLICT` "The payout job is already running"). A contract test finds `.transfers.create(` in
  exactly one function, `releasePayment`, across `server/`, `app/` and `scripts/` (tests and
  comments excluded).
- **Test:**
  - `server/services/payments/payment.service.test.ts` — a paid session ends `succeeded`, enrolled,
    `transferStatus: pending`, no Stripe transfer call; the already-succeeded branch makes none
    either;
  - `app/api/stripe/webhook/route.test.ts` — `account.updated` with payouts enabled calls
    `releaseForInstructor`;
  - `server/api/routers/payment.integration.test.ts` (new or extended) — `runPayoutJobNow` as
    STUDENT/INSTRUCTOR → FORBIDDEN; as ADMIN → summary; with the lock held → CONFLICT;
  - `server/services/_shared/conformance/transfers.contract.test.ts` — exactly one caller.
- **Files:** `server/services/payments/payment.service.ts`, `app/api/stripe/webhook/route.ts`,
  `server/api/routers/payment.ts`, the tests above.
- **AC:** AC-C14, FR-P1, FR-P24.
- **Commit:** `feat(refund): no transfer at sale; one release path for every trigger`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] Break the contract test on purpose: add a `transfers.create` call in `payment.service.ts`, see it go red, remove it
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 9 — Admin "Run job now" button

- **Contract:** the admin page's Operations block shows **Run job now** instead of Sweep. It calls
  `payment.runPayoutJobNow`; on success a toast names released / failed counts; on CONFLICT a toast
  says the job is already running. The component owns its mutation; no nested ternary; arrow
  function; one component per folder; no props → no `types.ts`. `SweepButton.tsx` is deleted.
- **Test:** none beyond Task 8's procedure tests (presentational wiring; the repo has no component
  test harness for admin pages). Verified manually in Final verification.
- **Files:** `app/(admin)/admin/_components/RunPayoutJobButton/index.tsx`, `app/(admin)/admin/page.tsx`,
  delete `app/(admin)/admin/SweepButton.tsx`.
- **AC:** FR-P24 ("Run job now"), AC-C14 (Sweep gone).
- **Commit:** `feat(refund): admin Run job now replaces Sweep`

- [ ] Implement · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 10 — Checkout status bound to its student

- **Contract:** `finalizeCheckout(sessionId, studentId)` finds the payment by session id **and**
  `studentId` in one query; another student's session → `{ status: "not_found" }` and nothing changes
  (no Stripe call, no enrollment). `payment.getSessionStatus` passes `ctx.session.user.id`.
- **Test:** `server/services/payments/payment.service.integration.test.ts` — student B with student
  A's `cs_…` gets `not_found`; A's payment stays `pending`, A is not enrolled, `checkout.sessions.retrieve`
  is not called; A gets `succeeded`.
- **Files:** `server/services/payments/payment.service.ts`, `server/repositories/payment.repository.ts`
  (`findBySessionIdForStudent`), `server/api/routers/payment.ts`, the test.
- **AC:** AC-C28, FR-P26.
- **Commit:** `fix(payments): checkout status only for the student who owns the session`

- [ ] Write the failing test · [ ] Run it, see it FAIL (B finalizes A's session today) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

## Task 11 — End to end: a sale is held, then paid once

- **Contract:** across the real services and the test DB, with Stripe mocked: a finalized checkout
  creates no transfer; a job run before the window end releases nothing; a run after the window
  transfers the net once; a second run, and an `account.updated` for the same instructor, transfer
  nothing more.
- **Test:** `server/services/payments/payoutHold.integration.test.ts`.
- **Files:** the test only.
- **AC:** AC-F13.
- **Commit:** `test(refund): a sale is held and released exactly once`

- [ ] Write the test · [ ] Run it, see it PASS (all behaviour exists by now) · [ ] Break it on purpose: re-add the transfer at sale, see it go red, restore · [ ] Commit

## Task 12 — Record what the slice changed

- **Contract:** `discovery/ai-decision-log.md` gains one entry for H1–H9 (what the AI proposed, how
  checked, `Why: TODO (me)`) and one for where the implementation differed from this plan. ADR-037
  gets an amendment only if H1 (null `paidAt`) or H7 (lock TTL / fallback) are approved — both refine
  §1 and §3.2. `spec.md`: `status` stays `in-progress`; Release checklist unchanged (the hold is Day 0
  but the student flag still waits for slice 3 and FR-P19a). `security.md`: C5, C6, C7, C14, C15, C28
  marked implemented for this slice, with the slice-3 remainder of C5/C7 named.
- **Files:** the four docs.
- **Commit:** `docs(refund): record slice-2 planning decisions`

- [ ] Write the entries · [ ] Run the contract tests and `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. Here: the migration backfill (Task 1) and the claim predicate (Task 3).

## Self-review

**Spec coverage — in this slice:**

| AC | Task | Covered |
|---|---|---|
| AC-F13 | 3, 4, 6, 8, 11 | Full |
| AC-F25 | 6 | Full |
| AC-C5 | 2, 3 | Claim is one conditional update; 14 d − 1 s and the 1 h margin not claimed. "Request committed between claim and transfer ends with one reversal" → slice 3 (no refund exists yet) |
| AC-C6 | 2, 3 | Full for the four paths (all go through Task 3's claim); "refund processing or failed" = `auto_approved` until slice 3 (H2) |
| AC-C7 | 4 | Transfers. Refunds and reversals → slice 3 |
| AC-C14 | 8, 9 | Full |
| AC-C15 | 7 | Full |
| AC-C16 | 5, 6, 8 | Full |
| AC-C28 | 10 | Full |

**Deferred — not in this slice:** AC-F12 (instructor view), AC-F27 (retained account, EC-20), AC-F28
(fee record), and every refund-effect AC (slice 3). AC-L8 still forbids the student flag before
slice 3 and FR-P19a.

**Guarded coverage:** C5 → Tasks 2–3 (with a break-it check); C6 → Task 3; C7 → Task 4; C14 →
Task 8 (contract test, break-it); C15 → Task 7; AC-C16 → Tasks 5–6; C28 → Task 10. Each has its own
test.

**Contract clarity / type consistency:** `releaseEligibleAt`, `appealDeadline` (Task 2) are used by
Task 3's SQL constants; `claimForRelease`, `findReleaseCandidates`, `markTransferred`, `releaseClaim`
(Task 3) are used by Task 4; `ReleaseOutcome` (Task 4) and `PayoutRunSummary` (Task 6) live in
`server/entities/payout/payout.dto.ts`; `releasePayment` (Task 4) is used by Tasks 6, 8, 11 and is
the only `transfers.create` caller; `runPayoutJobNow` (Task 8) is used by Task 9.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it checks: Task 3 (drop `NOT EXISTS` → AC-C6 red), Task 8 (second `transfers.create` →
  contract test red), Task 11 (transfer at sale → AC-F13 red).
- Manual, local DB (`localhost:5433/learnix`), Stripe test mode:
  - buy a course → the payment is `succeeded`, `transfer_status = pending`, no transfer in the Stripe
    dashboard;
  - set its `paid_at` 15 days back, click **Run job now** as admin → one transfer in Stripe with
    `transfer_group = <payment id>`; `payout_runs` has a row; click again → nothing new;
  - `curl` the cron route without a header and with a wrong secret → 401, empty body; with
    `CRON_SECRET` → 200 with counts only.
- Before deploy: apply the migration to every environment (the slice-1 billing outage on Neon came
  from a missing migration), set `CRON_SECRET` (≥ 32 chars) in Vercel.
