# Validation: Instructor Revenue Page & Dashboard Revenue Chart

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.
- `pnpm build` — the `/instructor/revenue` route compiles as a real default-export page (the prior mock did not).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `lib/formatUsd.ts` (`formatUsd`): `0` → `"$0"` (not "Free"); `9515000` → `"$95,150"`; `8999` → `"$90"` (rounds to nearest dollar); `-0` → `"$0"` (no negative-zero).
- `lib/stats/revenueRange.ts` (`resolveRange`):
  - `("30d", 2026-06-16T12:00)` → `{ since: 2026-05-17T12:00, bucket: "day" }`.
  - `("6m", 2026-06-16)` → `{ since: 2026-01-01, bucket: "month" }`.
  - `("12m", 2026-06-16)` → `{ since: 2025-07-01, bucket: "month" }`.
  - `("12m", 2026-02-10)` → `{ since: 2025-03-01, bucket: "month" }` (year rollover).
- `server/services/payments/payment.service.ts`:
  - `getRevenueSummary` (collaborators mocked): earnings `{available:8420, owed:2180, lifetimeGross:95150}` + month stats `{thisMonth:12450, lastMonth:11500}` → `totalGrossCents:95150`, `paidOutCents:8420`, `pendingCents:2180`, `thisMonth.grossCents:12450`, `thisMonth.delta = {kind:"percent", value:8, direction:"up"}`. Last month `0`, this month `>0` → `delta = {kind:"new"}`.
  - `getRevenueTimeSeries` (repo mocked, `vi.setSystemTime(2026-06-16)`, range `"6m"`): a single Mar bucket is gap-filled to 6 ascending points (Jan–Jun); empty months are `{grossCents:0, netCents:0}`; the Mar point carries `{grossCents:15000, netCents:12000}`.
  - `getRevenueByCourse` (repo + `courseRepository.findMany` mocked): preserves repo ranking and hydrates titles → `[{c2,"Web Dev",8000},{c1,"React",3000}]`.
  - `getRecentTransactions` (repo mocked): maps rows to the DTO with derived status — `succeeded`+`refundedAt:null` → `"completed"`, `refundedAt` set → `"refunded"`; a `null` student name renders as `"Unknown"`.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

Seed via the existing test factories (`test/factories.ts`) and the file's `makePayment` helper, mirroring `payment.repository.integration.test.ts`.

- **Revenue by bucket** (`paymentRepository.getRevenueByBucket`): two succeeded sales in the same month sum into one bucket (`grossCents` = Σ`amountCents`, `netCents` = Σ`instructorNetCents`); a `refunded`/`refundedAt`-set payment is excluded; another instructor's payments are excluded (returns `[]` for an instructor with no sales).
- **Revenue grouped by course** (`paymentRepository.getRevenueGroupedByCourse`): returns courses ranked by gross descending, capped at the `limit`; only the calling instructor's courses appear; the `_sum.amountCents` reconciles per course.
- **Reconciliation (FR9):** for a seeded instructor, Σ`grossCents` of `getRevenueByBucket` over the lifetime window equals `getInstructorRevenueStats.lifetimeGrossCents` (same canonical filter `status='succeeded' AND refunded_at IS NULL`).

> No new component (RTL) tests — the repo has no component-test harness; UI behaviour is covered by `pnpm build` + the manual scenarios below.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Total Revenue = lifetime gross, = dashboard card) | `getRevenueSummary` unit test; reconciliation integration test; manual scenario 2 & 5 |
| FR2 (This Month + MoM delta + zero-handling) | `getRevenueSummary` unit tests (percent + "new"); manual scenarios 2 & 4 |
| FR3 (Paid Out = transferred net) | `getRevenueSummary` unit test; manual scenario 2 |
| FR4 (Pending Payout = owed net) | `getRevenueSummary` unit test; manual scenario 2 |
| FR5 (Manage payouts → Express dashboard, no withdraw) | Reuses `PayoutsActionButton` (plan Task 16.4); manual scenario 3 |
| FR6 (Not-onboarded payout state) | `getConnectStatus` drives button label; manual scenario 4 (fresh instructor) |
| FR7 (Revenue-over-time chart + empty state) | `getRevenueByBucket` integration; `getRevenueTimeSeries` gap-fill unit test; manual scenarios 2 & 4 |
| FR8 (Revenue-by-course chart + empty state) | `getRevenueGroupedByCourse` integration; `getRevenueByCourse` unit test; manual scenarios 2 & 4 |
| FR9 (Figures reconcile) | Reconciliation integration test; manual scenario 5 |
| FR10 (Recent transactions table + statuses) | `getRecentTransactions` unit test (status mapping); manual scenario 2 |
| FR11 (Time-range selector drives charts only) | `resolveRange` unit tests; manual scenario 6 |
| FR12 (Dashboard real chart, no placeholder) | `getRevenueTimeSeries` RSC helper + `DashboardRevenueChart` (plan Tasks 13–15); manual scenario 1 |
| FR13 (View Details → working page) | Page rewrite (plan Task 17); manual scenario 1 |
| FR14 (Authorization, no IDOR) | `instructorProcedure` on all 4 queries (plan Task 10); `getRevenueByBucket`/`getRevenueGroupedByCourse` instructor-scope integration tests; manual scenario 7 |
| FR15 (Own-data correctness) | Instructor-scope integration tests; manual scenario 2 (two instructors) |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d          # local Postgres on 5433
pnpm dev                      # dev server
# Seed: instructor A with 2+ published courses, succeeded payments spread across
#   this month and last month (varying courses), at least one refunded payment,
#   some transfers marked transferred and some pending; instructor B with sales on
#   their own course; one brand-new instructor C with nothing.
# Confirm ground-truth numbers in Prisma Studio (pnpm db:studio).
```

1. **Dashboard chart (FR12/FR13):** Sign in as instructor A, open `/instructor`.
   → The "Revenue Overview" card shows a real area chart of monthly gross (no dashed
   "Revenue chart will be displayed here" placeholder). Clicking **View Details** lands on a
   working `/instructor/revenue` page (no crash, no missing-module error).
2. **Populated revenue page (FR1–FR4, FR7, FR8, FR10):** As A, open `/instructor/revenue`.
   → **Total Revenue** = Σ succeeded non-refunded `amountCents` as `$N,NNN`; **This Month**
   shows current-month gross with a real `% from last month` (up/down arrow); **Paid Out** =
   transferred net; **Pending Payout** = owed net. The revenue-over-time chart shows gross +
   net series; the by-course chart ranks A's courses; the transactions table lists recent
   sales with Completed/Pending/Refunded badges and amounts.
3. **Manage payouts (FR5):** On the revenue page, click **Open Stripe dashboard** (instructor
   A is onboarded). → A new tab opens the Stripe Express dashboard. There is no in-app
   "Withdraw funds" button and no manual payout amount field.
4. **Fresh instructor (FR2, FR6, FR7, FR8):** Sign in as C (no sales), open
   `/instructor/revenue`. → All four cards show `$0` (not "Free"); This Month delta line is
   omitted; both charts show "No sales in this range"; transactions show "No sales yet"; the
   payouts action shows the onboarding CTA (e.g. "Set up payouts"), not a broken link. No
   console/runtime errors.
5. **Reconciliation (FR1/FR9):** Compare A's **Total Revenue** on `/instructor` (stat card)
   and `/instructor/revenue` (summary card). → Identical value. Summing the over-time chart's
   gross across the 12-month range approximates Total Revenue (equal when all sales fall in
   range).
6. **Range selector (FR11):** On the revenue page, switch Last 30 days / 6 months / 12 months.
   → Both charts refetch and rebucket (30d = daily points, 6m/12m = monthly); the summary
   cards and transactions table do **not** change.
7. **Authorization boundary (FR14):** As instructor B, load `/instructor/revenue`. → Only B's
   own revenue, courses, and transactions appear (never A's). As a STUDENT, calling
   `api.payment.getRevenueSummary` (via devtools/tRPC client) is rejected with
   `UNAUTHORIZED`/`FORBIDDEN`.

## Edge cases & regression

- **Zero last month, sales this month:** This Month delta shows "New this month", never
  `Infinity%` or a divide-by-zero (FR2).
- **Both months zero / flat:** delta omitted, or "No change from last month" with no arrow.
- **Refunded / pending / failed payments:** excluded from gross revenue, net, time series, and
  per-course totals (only `status='succeeded' AND refunded_at IS NULL`); refunded sales still
  appear in the transactions table with a Refunded badge.
- **Gap-filled buckets:** months/days with no sales render as zero points so the chart line is
  continuous, not broken or omitted.
- **Course/student deleted or unnamed:** transaction rows fall back to "Untitled course" /
  "Unknown" rather than rendering blank or throwing.
- **Transient backend failure:** the dashboard RSC helper returns `[]`, so `/instructor` still
  renders with the chart's empty state instead of crashing; a failed Connect-link mutation is
  toasted, not fatal.
- **Cross-instructor isolation:** every query is scoped to `ctx.session.user.id`; integration
  tests assert another instructor's rows never appear (no IDOR).
- **No regression:** the dashboard's "Top Performing Courses" and "Recent Activity" sections
  and the existing four stat cards render exactly as before; only the revenue placeholder is
  replaced.

## Definition of done

- [ ] All automated checks green (`pnpm test`, `typecheck`, `check`, `build`); new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted (raw-SQL/Prisma filter parity via reconciliation test; `resolveRange` boundary unit tests; page-vs-dashboard Total Revenue equality; recharts shipped only in client islands).
- [ ] Docs updated where warranted (CLAUDE.md payments section noting the new `payment.getRevenue*` / `getRecentTransactions` queries and the revenue page).