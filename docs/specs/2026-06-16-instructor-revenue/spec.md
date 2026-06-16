# Spec: Instructor Revenue Page & Dashboard Revenue Chart

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Add four read-only `instructorProcedure` queries to the **`payment` router** (the revenue
domain already lives there via `getInstructorEarnings`) and consume them from a rewritten
`/instructor/revenue` page plus one new dashboard chart. No schema changes — every figure
derives from existing `Payment` columns.

- **Summary cards (FR1–FR4)** reuse the existing aggregates: `getInstructorEarnings`
  (lifetime gross, transferred/available, owed/pending) + `getInstructorRevenueStats`
  (this/last-month gross) + the pure `computeDelta` already used by the dashboard. A thin
  `getRevenueSummary` service method composes them into one DTO so the page makes a single
  summary round-trip and the Total Revenue figure provably matches the dashboard card (FR1,
  decision #2).
- **Charts (FR7, FR8, FR12)** are backed by two range-parameterised queries:
  `getRevenueTimeSeries(range)` (gross + net per time bucket) and `getRevenueByCourse(range)`
  (top courses by gross). Time-series bucketing is the one place raw SQL is warranted
  (`date_trunc` over `created_at`), consistent with the repository-owns-raw-SQL precedent in
  `EmbeddingRepository`; per-course uses Prisma `groupBy`. The service fills empty buckets
  with zero so charts are continuous.
- **Transactions (FR10)** come from `getRecentTransactions(limit)` — a bounded
  `findMany` with `course`/`student` relations included, mapped to a flat DTO.
- **Payouts (FR5, FR6)** reuse the existing Connect surface: the page renders the existing
  `PayoutsActionButton` driven by `getConnectStatus`, which already switches between
  "complete onboarding" and "open Stripe dashboard". No new payout code.

**Page composition.** `/instructor/revenue` becomes a thin Server Component rendering a
`"use client"` `RevenueOverview` that owns the range state and fetches via the tRPC client
(mirroring `PayoutsSection`). The **dashboard** stays a Server Component: it fetches the
default-range time series server-side through a `lib/requests` helper (zeroed fallback) and
passes it to a `"use client"` presentational chart, so the page remains a single RSC
round-trip.

**Key trade-off — split charts vs. one bundled endpoint.** The range selector re-fetches
only chart data, while summary cards and transactions are range-independent. Bundling all
four into one range-keyed endpoint would needlessly refetch summary/transactions on every
range change, so we keep them as separate, independently-testable queries and let the two
range-bound ones re-run together on selector change.

## Architectural decisions referenced

- **ADR-019 (payments / merchant-of-record):** payouts are automatic Stripe transfers;
  "Paid out" = transferred net, "Pending payout" = owed net, payout admin is delegated to
  the Express dashboard. No in-app withdraw (decision #1).
- **ADR-004 (role-based tRPC procedures):** all new endpoints are `instructorProcedure`;
  instructor id comes from `ctx.session.user.id` only (FR14).
- **ADR-003 (repository pattern):** all DB access goes through `paymentRepository`
  (extending `BaseRepository`); raw time-bucket SQL lives in the repository, not the service.
- **ADR-011 (component folder architecture) + `CLAUDE.md` conventions:** colocated
  `types.ts`, extracted sub-components for repeated card/row layout, no nested ternaries,
  flattened loading states.

**New dependency (no ADR warranted):** add `recharts` plus shadcn-style `chart` and `table`
UI primitives under `app/_components/_shared/ui/`. This is a conventional UI addition (the
mock was authored against exactly these), not an architectural decision; it follows the
existing Radix + Tailwind + `cva` primitive pattern.

## Data model

No schema changes, no migration, no backfill. All figures derive from existing columns:

- `Payment` (`prisma/schema/payments.prisma`) — `amountCents`, `instructorNetCents`,
  `platformFeeCents`, `status`, `transferStatus`, `refundedAt`, `createdAt`, `courseId`,
  `studentId`, indexed by `instructorId`.
- `Course` — `title` (for the per-course chart and transaction rows).
- `User` — `name` (transaction buyer; `student` relation on `Payment`).

Canonical filters (match existing earnings logic):
- **Gross revenue:** `status = succeeded`, `refundedAt = null`, sum `amountCents`.
- **Net:** same filter, sum `instructorNetCents`.
- **Paid out:** above + `transferStatus = transferred` (= earnings `availableCents`).
- **Pending payout:** `transferStatus = pending` (= `getOwedBalance`).

## API & contracts

All on `server/api/routers/payment.ts`, `instructorProcedure`, instructor id from session.

| Procedure | Input → Output | Notes |
|-----------|----------------|-------|
| `payment.getRevenueSummary` | `void` → `RevenueSummary` | Composes `getInstructorEarnings` + `getInstructorRevenueStats` + `computeDelta`. FR1–FR4. |
| `payment.getRevenueTimeSeries` | `{ range: RevenueRange }` → `RevenueTimeSeriesPoint[]` | Gross + net per bucket, gap-filled, ascending by period. FR7, FR12. |
| `payment.getRevenueByCourse` | `{ range: RevenueRange }` → `RevenueByCourseItem[]` | Top 5 courses by gross within range, desc. FR8. |
| `payment.getRecentTransactions` | `{ limit?: number }` (default 10, max 50) → `RevenueTransaction[]` | Newest first. FR10. |

### DTOs & input (`server/entities/payment/revenue.ts`)

```ts
import { z } from "zod";
import type { StatDelta } from "@/server/entities/instructor/dashboard";

export const revenueRangeSchema = z.enum(["30d", "6m", "12m"]);
export type RevenueRange = z.infer<typeof revenueRangeSchema>;

export type RevenueSummary = {
  totalGrossCents: number;                          // FR1 (= dashboard Total Revenue)
  thisMonth: { grossCents: number; delta: StatDelta }; // FR2
  paidOutCents: number;                             // FR3
  pendingCents: number;                             // FR4
};

export type RevenueTimeSeriesPoint = {
  period: string;        // ISO date marking the bucket start (day or month)
  grossCents: number;
  netCents: number;
};

export type RevenueByCourseItem = {
  courseId: string;
  title: string;
  grossCents: number;
};

export type RevenueTransactionStatus =
  | "completed" | "pending" | "refunded" | "failed";

export type RevenueTransaction = {
  id: string;
  courseTitle: string;
  studentName: string;
  createdAt: Date;
  amountCents: number;
  status: RevenueTransactionStatus;
};
```

`StatDelta` is reused from the dashboard so the "New"/hidden delta UI is shared with FR2/FR4.
Status mapping: `refundedAt != null → refunded`; else `succeeded → completed`,
`pending → pending`, `failed → failed`.

### Range → bucket resolution (`lib/stats/revenueRange.ts`, pure, tested)

```ts
resolveRange(range, now?) → { since: Date; bucket: "day" | "month" }
// "30d" → { since: now-30d, bucket: "day" }
// "6m"  → { since: start of month 5 months ago, bucket: "month" }
// "12m" → { since: start of month 11 months ago, bucket: "month" }
```

The service uses `since`/`bucket` to drive the repo query and to **gap-fill** missing
buckets with `{ grossCents: 0, netCents: 0 }` so the chart line is continuous.

## Component / data flow

```
/instructor/revenue (Server Component page)
   └─ <RevenueOverview/>  ("use client", owns range state)
        ├─ api.payment.getRevenueSummary.useQuery()        → <RevenueSummaryCards/>  (FR1–FR4)
        ├─ <RevenuePayouts/>                                (FR5/FR6)
        │     ├─ api.payment.getConnectStatus.useQuery()
        │     └─ <PayoutsActionButton status=…/>            (reused as-is)
        ├─ <RevenueRangeSelect value=range onChange=…/>     (FR11)
        ├─ api.payment.getRevenueTimeSeries.useQuery({range}) → <RevenueOverTimeChart/> (FR7)
        ├─ api.payment.getRevenueByCourse.useQuery({range})   → <RevenueByCourseChart/> (FR8)
        └─ api.payment.getRecentTransactions.useQuery()       → <RevenueTransactionsTable/> (FR10)

app/instructor/page.tsx (Server Component)
   └─ const series = await getRevenueTimeSeries()   ← lib/requests/instructor/getRevenueTimeSeries.ts
        (default "12m", try/catch → [] fallback)
   └─ <DashboardRevenueChart data={series}/>  ("use client", recharts)   (FR12)
        — replaces the dashed placeholder; "View Details" → /instructor/revenue (FR13)

paymentService.getRevenueSummary(id)      → earnings + revenueStats + computeDelta
paymentService.getRevenueTimeSeries(id,r) → resolveRange + repo.getRevenueByBucket + gap-fill
paymentService.getRevenueByCourse(id,r)   → resolveRange + repo.getRevenueGroupedByCourse + hydrate titles
paymentService.getRecentTransactions(id,n)→ repo.findMany({include:{course,student}}) + map DTO
```

Each chart/table renders three flattened states: loading skeleton, empty-state (no data in
range / no sales), and populated — no nested ternaries (FR7/FR8/FR10 empty states).

## File list

**New**
- `server/entities/payment/revenue.ts` — `revenueRangeSchema`, `RevenueSummary`, `RevenueTimeSeriesPoint`, `RevenueByCourseItem`, `RevenueTransaction(+Status)`.
- `lib/stats/revenueRange.ts` — `resolveRange(range, now?)`; pure, unit-tested.
- `lib/requests/instructor/getRevenueTimeSeries.ts` — RSC fetch wrapper, default `"12m"`, `[]` fallback (mirrors `getDashboardStats`).
- `app/_components/_shared/ui/chart.tsx` — shadcn `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`ChartConfig` (recharts wrapper).
- `app/_components/_shared/ui/table.tsx` — shadcn `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`.
- `app/_components/Instructor/Revenue/index.tsx` — `RevenueOverview` client orchestrator (range state).
- `app/_components/Instructor/Revenue/types.ts` — all prop types for the page + sub-components.
- `app/_components/Instructor/Revenue/components/RevenueSummaryCards.tsx` — 4 cards + `StatCard`/`DeltaBadge` (FR1–FR4).
- `app/_components/Instructor/Revenue/components/RevenuePayouts.tsx` — paid-out/pending + reused `PayoutsActionButton` (FR5/FR6).
- `app/_components/Instructor/Revenue/components/RevenueRangeSelect.tsx` — 30d/6m/12m selector (FR11).
- `app/_components/Instructor/Revenue/components/RevenueOverTimeChart.tsx` — gross vs. net area chart (FR7).
- `app/_components/Instructor/Revenue/components/RevenueByCourseChart.tsx` — horizontal bar chart (FR8).
- `app/_components/Instructor/Revenue/components/RevenueTransactionsTable.tsx` — recent sales table + status badge (FR10).
- `app/_components/Instructor/DashboardRevenueChart/index.tsx` — presentational client chart for the dashboard (FR12).
- `app/_components/Instructor/DashboardRevenueChart/types.ts` — its prop type.

**Modified**
- `server/repositories/payment.repository.ts` — add `getRevenueByBucket(instructorId, since, bucket)` (raw `date_trunc` SQL → `{ period, grossCents, netCents }[]`), `getRevenueGroupedByCourse(instructorId, since, limit)` (Prisma `groupBy` on `courseId`, `_sum.amountCents`, desc).
- `server/services/payments/payment.service.ts` — add `getRevenueSummary`, `getRevenueTimeSeries`, `getRevenueByCourse`, `getRecentTransactions`.
- `server/api/routers/payment.ts` — add the four `instructorProcedure` queries.
- `server/entities/payment/index.ts` — re-export `./revenue`.
- `app/instructor/revenue/page.tsx` — replace the mock with a Server Component default export rendering `<RevenueOverview/>`.
- `app/instructor/page.tsx` — replace the dashed "Revenue Overview" placeholder with `<DashboardRevenueChart data={await getRevenueTimeSeries()} />` (FR12); keep the existing Total Revenue stat card and the existing "View Details" link (FR13).
- `package.json` — add `recharts`.

## Cross-cutting concerns

- **Security / authz (FR14, FR15):** every query is `instructorProcedure`; all aggregates,
  groupings, and `findMany`s filter on `instructorId = ctx.session.user.id`. No instructor
  id, course id, or limit beyond the capped range is taken from the client. Transactions
  expose only the instructor's own buyers (student name + sale metadata only — no
  payment-method/PII).
- **Error handling / reliability:** router wraps service calls in `handleServiceError`; the
  RSC dashboard helper catches and returns `[]` so a transient failure degrades to an empty
  chart, not a crashed dashboard. The Connect/payout link is fetched on demand and its
  failure is toasted (existing `PayoutsActionButton` behaviour), never breaking the page.
- **Empty states:** new instructor → `$0` cards, empty chart/table states, onboarding CTA on
  the payouts action. `computeDelta` yields `new`/`none` so no fabricated percentages.
- **Performance:** summary aggregates run via `Promise.all`; time-series and per-course use a
  single grouped DB query each (no row hydration to sum in JS, no N+1 over courses); per-course
  title hydration is one `findMany` by id set; transactions are a single bounded `findMany`.
- **Observability:** the new service methods log at info with `{ instructorId }` (and `range`
  where applicable), consistent with `getDashboardStats`/`getInstructorEarnings`.

## Risks & mitigations

| Risk | L/I | Mitigation |
|------|-----|------------|
| Raw `date_trunc` SQL drifts from Prisma filter semantics (e.g. refunded rows leak in) | M/M | Encode the exact canonical filter (`status='succeeded' AND refunded_at IS NULL`) in the raw query; integration test reconciles time-series gross sum against `getInstructorRevenueStats.lifetimeGross` (FR9). |
| Timezone/bucket off-by-one at month/day boundaries | M/L | `resolveRange` is pure + unit-tested across month/year rollover; reuse server-local `date_trunc` (matches existing `getMonthWindows` convention). |
| Total Revenue on page ≠ dashboard card | L/M | Both derive Total Revenue from the same `getInstructorRevenueStats.lifetimeGross`; assert equality in the summary test (FR1, decision #2). |
| recharts bundle weight on the dashboard RSC | L/L | Chart components are `"use client"` leaves; the dashboard page stays server-rendered and only ships the chart island. |
| Adding shared `chart`/`table` primitives collides with future shadcn usage | L/L | Use the canonical shadcn file names/exports so later generated components match. |

## Rollout / migration

No env vars, no migration, no feature flag. Additive endpoints + new components plus two page
rewrites, shipped on `feat/revenue-page`. Revert is removing the four endpoints/components and
restoring the two pages; the new repo/service methods are inert if uncalled.