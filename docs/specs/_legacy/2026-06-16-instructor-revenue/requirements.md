# Requirements: Instructor Revenue Page & Dashboard Revenue Chart

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

Date: 2026-06-16 · Author: Volodymyr Pelykh · Stakeholder: Volodymyr Pelykh

## Problem

There is no working revenue surface for instructors, and the dashboard's revenue
section is a placeholder.

- `app/instructor/revenue/page.tsx` is a dropped-in v0/shadcn mock built entirely from
  hardcoded constants (`monthlyRevenue`, `courseRevenue`, `transactions`, `stats` —
  `app/instructor/revenue/page.tsx:46-159`). It does not compile or route in this
  codebase: it exports a named `RevenueOverview` rather than a Next default page export,
  and imports `@/components/ui/chart`, `@/components/ui/table`, and `recharts`, none of
  which exist in the repo. The route is already wired into the sidebar
  (`app/_components/Dashboard/Sidebar/components/Navigation/index.tsx:54`) and linked
  from the dashboard, so it is reachable but broken.
- The instructor dashboard shows a dashed "Revenue chart will be displayed here"
  placeholder (`app/instructor/page.tsx:148-163`) with a "View Details" link pointing at
  that broken revenue route.

Meanwhile the backend already exposes the real data this surface needs —
`paymentService.getInstructorEarnings` returns lifetime gross, platform fees,
transferred (available), and owed (pending) amounts
(`server/services/payments/payment.service.ts:187`); `getInstructorRevenueStats` returns
lifetime / this-month / last-month gross
(`server/repositories/payment.repository.ts:56`) — but no UI consumes it for a revenue
breakdown, time series, per-course split, or transaction list.

## Goal

- An instructor sees their own real earnings on `/instructor/revenue`: lifetime gross,
  this-month gross with month-over-month change, amount already paid out, and amount
  still pending payout.
- An instructor sees how their revenue trends over time and which courses earn the most.
- An instructor sees a list of their recent sales (course, buyer, date, amount, status).
- Payout management reflects how the platform actually pays instructors: automatic
  Stripe transfers surfaced as paid-out vs. pending balances, with payout administration
  delegated to the Stripe Express dashboard — no in-app withdrawal flow.
- The dashboard's revenue placeholder is replaced by a real revenue-over-time chart, and
  "View Details" lands on a working revenue page.
- A brand-new instructor with no sales sees zeroed values and empty states, never
  fabricated numbers or runtime errors.

## Scope decisions (locked)

1. **Reflect the real (automatic) payout model — no in-app withdraw.** The page shows
   "Paid out" (transferred net) and "Pending payout" (held/owed net) balances and a
   "Manage payouts" action that opens the Stripe Express dashboard via the existing
   `payment.createConnectLoginLink`. This rules out building a Stripe payout/withdrawal
   flow and keeps the feature within the current merchant-of-record architecture
   (ADR-019).
2. **Total Revenue = lifetime gross sales**, defined identically to the dashboard's
   existing Total Revenue card (`SUM(amountCents)` over succeeded, non-refunded payments)
   — the two surfaces must agree. Net/payout figures are shown as separate cards.
3. **The dashboard gets a real revenue-over-time chart only.** It replaces the dashed
   placeholder; the existing Total Revenue stat card is kept as-is. "Top Performing
   Courses" and "Recent Activity" on the dashboard remain out of scope (still mocked,
   tracked separately).
4. **Four page sections are in scope:** summary cards, revenue-over-time chart,
   revenue-by-course chart, recent-transactions table.
5. **A time-range selector (Last 30 days / 6 months / 12 months) drives the charts**
   (and is the comparison window for "Revenue by course"). The summary cards always show
   lifetime / this-month figures and are not affected by the selector.
6. **CSV export is deferred.** The mock's "Export" button is not built in this feature.
7. **Transactions show a recent, bounded list** (most recent N, newest first) with a
   "View all" affordance — not a fully paginated/filterable ledger.
8. **Single currency (USD).** All amounts come from `*Cents` integer columns and are
   formatted as whole-dollar USD, consistent with the dashboard cards.

## Assumptions & constraints

- Amounts are stored in cents on `Payment` (`amountCents`, `platformFeeCents`,
  `instructorNetCents`); revenue uses gross `amountCents`, payouts use
  `instructorNetCents`.
- "Paid out" = succeeded, non-refunded payments with `transferStatus = transferred`;
  "Pending payout" = the owed balance (`transferStatus = pending`), matching
  `paymentRepository.getOwedBalance`.
- "This month" / "last month" are calendar months in server local time, consistent with
  the existing dashboard delta windows (`lib/stats/monthWindows.ts`).
- Access is restricted to the authenticated instructor; every query is scoped to
  `ctx.session.user.id` via `instructorProcedure` — no instructor id is accepted from the
  client.
- Must follow the three-layer pattern (router → service → repository, all DB access
  through `BaseRepository`) and the `CLAUDE.md` component conventions (colocated
  `types.ts`, no nested ternaries, extracted sub-components, flattened loading states).
- A charting library (e.g. recharts) and shared chart/table UI primitives are not
  currently present and will be introduced in `spec.md`; the requirement here is only the
  observable charting behaviour.

## Functional requirements

### Revenue page — summary cards

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Total Revenue card | Shows lifetime gross sales for the instructor (`SUM(amountCents)` where `instructorId` = current user, `status = succeeded`, `refundedAt = null`), formatted as USD. Equals the dashboard's Total Revenue card for the same instructor. With no sales, shows `$0`. |
| FR2 | This Month card | Shows current-month gross sales and a month-over-month delta vs. last month. Up/down are visually distinguished; last month = 0 and this month > 0 shows "New"; both months = 0 hides the delta. |
| FR3 | Paid Out card | Shows the net amount already transferred to the instructor (`SUM(instructorNetCents)` where `transferStatus = transferred`, `status = succeeded`, `refundedAt = null`). With nothing transferred, shows `$0`. |
| FR4 | Pending Payout card | Shows the net amount owed but not yet transferred (the owed balance: `SUM(instructorNetCents)` where `transferStatus = pending`). With nothing pending, shows `$0`. |

### Revenue page — payouts

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR5 | Manage payouts | A "Manage payouts" action opens the instructor's Stripe Express dashboard (via `payment.createConnectLoginLink`). There is no in-app withdraw button and no manual payout amount entry. |
| FR6 | Payout state when not onboarded | If the instructor has not completed Stripe Connect onboarding (no payouts-enabled account), the page does not error: it shows pending/owed balances and surfaces the path to onboarding/managing payouts rather than a broken or dead "Manage payouts" action. |

### Revenue page — charts

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR7 | Revenue-over-time chart | Shows gross revenue and net payout per period bucket over the selected time range, newest period last. Buckets and span follow the selected range (FR11). With no sales in range, shows an empty-state, not a crash. |
| FR8 | Revenue-by-course chart | Shows the instructor's top earning courses within the selected range, ranked by gross revenue, as a horizontal bar chart. Courses with no sales in range are omitted. With no sales, shows an empty-state. |
| FR9 | Figures reconcile | For a given instructor, summing the revenue-over-time gross across all periods within "lifetime" reconciles with FR1; the per-course chart totals do not exceed the corresponding range total. |

### Revenue page — transactions

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | Recent transactions table | Shows the instructor's most recent sales (bounded count, newest first): course title, student name, date, gross amount, and status. Status reflects the payment lifecycle — at minimum Completed (succeeded), Pending, and Refunded are visually distinguished. With no sales, shows an empty-state row/message. |

### Revenue page — controls

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR11 | Time-range selector | A selector offers Last 30 days / Last 6 months / Last 12 months and changes the data shown in the two charts (FR7, FR8). The summary cards (FR1–FR4) are unaffected by the selector. |

### Dashboard revenue block

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR12 | Dashboard revenue chart | The dashed "Revenue Overview" placeholder on `app/instructor/page.tsx` is replaced by a real revenue-over-time chart for the current instructor (default span, e.g. last 12 months). With no sales, shows an empty-state, not the placeholder and not a crash. |
| FR13 | View Details link | The "View Details" link on the dashboard revenue block points to `/instructor/revenue`, which renders the working page above. |

### Cross-cutting

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR14 | Authorization | All revenue data is served by `instructorProcedure` endpoints scoped to `ctx.session.user.id`; no instructor id is accepted from the client, and one instructor can never see another's revenue, payouts, or transactions. |
| FR15 | Own-data correctness | Two different instructors see different, correct figures matching their own `Payment` rows; values are verifiable against the database. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | `instructorProcedure` only; instructor id from session, never client input. No cross-instructor leakage of revenue, payouts, student identities, or transactions. |
| Performance | Aggregates run concurrently; time-series and per-course data come from grouped DB queries (no N+1 over payments/courses, no row hydration to count/sum in JS). |
| Reliability | A transient data-fetch failure degrades gracefully (empty/zeroed surface), consistent with the dashboard's `getDashboardStats` fallback pattern; the live Stripe payout link is fetched on demand and its failure does not break the page. |
| Accessibility / UX | Delta direction and transaction status conveyed by text/icon, not color alone; charts have empty states; zeroed values for new instructors. |
| Observability | Revenue aggregation logs with the instructor id, consistent with existing service logging. |
| Data / privacy | Only the instructor's own buyers are shown; no payment-method/PII beyond student name and sale metadata; amounts derived from stored cents, nothing new persisted. |

## Success metrics

- An instructor with sales sees `/instructor/revenue` render real lifetime gross,
  this-month gross + delta, paid-out, and pending figures that reconcile with Prisma
  Studio, plus a populated time-series, per-course chart, and recent-transactions list.
- A newly created instructor account sees `$0` cards, empty chart/table states, and a
  working "Manage payouts" path, with no runtime errors and no fabricated numbers.
- The dashboard shows a real revenue chart (no dashed placeholder), and "View Details"
  opens the working revenue page.
- The Total Revenue figure on the dashboard and on the revenue page match for the same
  instructor.

## Out of scope (deferred)

- CSV / data export of revenue or transactions (mock "Export" button).
- In-app withdrawal / manual payout flow (payouts remain automatic + Express dashboard).
- Custom/arbitrary date ranges or custom comparison periods beyond the three presets.
- A fully paginated, filterable transaction ledger (only a recent bounded list here).
- "Top Performing Courses" and "Recent Activity" sections on the dashboard.
- Multi-currency support.
- Real-time / live-updating figures (data is fetched per request load).

## Open questions

- None.