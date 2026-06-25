---
feature: instructor-mobile
status: stable
models: []
depends-on: [mobile-responsive]
---

## Purpose

The `mobile-responsive` feature explicitly deferred the instructor portal ("course editor
drag-and-drop curriculum, analytics charts, data tables") to a later pass. The portal **shell** is
already mobile-ready for free — `app/instructor/layout.tsx` reuses the responsive
`Dashboard/Layout`, so the sidebar drawer, header hamburger, and collapsible rail already work, and
the shared `Table` primitive already wraps in `overflow-x-auto`. What remains broken on phones are
the **Recharts charts** themselves: on a 375px viewport the time-series charts render ~12 `"MMM"`
x-axis ticks that collide into unreadable mush, revenue y-axis dollar labels (`$1,234`) crowd the
plot, and the "by course" bar/legend labels overflow. This feature makes the instructor charts
legible on phones without regressing the desktop layout.

This is the first stage of the instructor-portal mobile pass. Later stages (table/page polish, the
course editor + `@dnd-kit` curriculum reordering on touch) are tracked as out of scope below and
will extend this spec when built.

## Functional scope

### Stage 1 — charts (this stage)

- A shared `useIsMobile()` client hook (`app/_components/_shared/hooks/useIsMobile.ts`) backed by
  `window.matchMedia("(max-width: 767px)")` — i.e. below the `md` breakpoint, matching the rest of
  the mobile work. It is SSR-safe: it returns `false` on the server and on first client render,
  then corrects after mount via an effect. Charts already show a loading skeleton while their tRPC
  query resolves, so there is no visible flash. The hook is the single source for "is this a small
  screen" and is reusable by later instructor-mobile stages.
- A `formatUsdCompact(cents)` helper in `lib/formatUsd.ts` producing short money labels (`$0`,
  `$950`, `$1.2k`, `$95k`, `$1.1M`). Used **only** for chart y-axis ticks on mobile. Tooltips and
  all other UI keep full-precision `formatUsd`.
- Time-series charts thin their x-axis ticks via **pure Recharts props**
  (`interval="preserveStartEnd"` + `minTickGap={24}`) so colliding month labels drop out based on
  rendered width — identical prop on every viewport, no hook needed. Applies to:
  `DashboardRevenueChart`, `RevenueOverTimeChart`, `EnrollmentTrendChart` (which also powers the
  per-course analytics page via `CourseAnalyticsCharts`), and `CompletionTrendChart`.
- Revenue charts (`DashboardRevenueChart`, `RevenueOverTimeChart`) switch their y-axis tick
  formatter to `formatUsdCompact` **only when `useIsMobile()` is true**; on desktop they keep
  `formatUsd`. This keeps the desktop axis pixel-identical to today.
- `RevenueByCourseChart` (vertical bars, course-title category axis) truncates its category tick
  labels to ~14 characters with an ellipsis and forces `interval={0}` **only on mobile**; the
  full course title remains available in the tooltip. Desktop is unchanged.
- `EnrollmentsByCourseChart` (pie + legend) is already responsive (`flex-col sm:flex-row`,
  truncating legend rows) — verified, no code change expected.

### Out of scope (later stages of this feature)

- Table & page polish: tighter mobile padding, scroll affordances, reviews/students card layouts.
- The course editor and `@dnd-kit` curriculum drag-and-drop on touch devices.
- The instructor messaging view (covered by the `mobile-responsive` messaging work).

## Acceptance criteria

- On a 375px-wide viewport, none of the instructor charts (dashboard Revenue Overview, Revenue page
  over-time + by-course, Analytics enrollment/completion/by-course, per-course analytics) render
  overlapping or unreadable x-axis tick labels.
- On a 375px-wide viewport, no instructor dashboard / revenue / analytics page causes horizontal
  scrolling of the page body (charts and their axis labels stay within their cards).
- On a 375px-wide viewport, the revenue charts' y-axis uses compact notation (e.g. `$1.2k`), and the
  "Revenue by Course" labels are truncated with an ellipsis while the chart tooltip shows the full
  course title.
- On viewports ≥`md` (≥768px), every instructor chart renders pixel-identical to its current desktop
  layout: full month ticks where width allows, full-precision dollar y-axis, and untruncated
  course-title labels.
- `useIsMobile()` does not cause a hydration mismatch warning, and charts do not visibly flash
  between desktop and mobile formatting on load.

## Agent notes

- The instructor shell is **already responsive** via `Dashboard/Layout` — do not rebuild a sidebar
  or drawer here. See [[mobile-responsive]] for the shell/primitive foundation this builds on.
- `interval="preserveStartEnd"` + `minTickGap` is preferred over a hook for tick thinning because
  Recharts already drops colliding ticks by rendered width; reserve `useIsMobile()` for cases where
  width must change the *content* (formatter, truncation), not just layout. This is the
  "hook vs. pure CSS depending on the situation" split agreed during brainstorming.
- All chart components are `"use client"` already, so reading `useIsMobile()` in them is free; do
  not hoist the hook into the server pages.
- `useIsMobile.ts` follows the existing `_shared/hooks` convention: `"use client"`, arrow-function
  `const`, default export (mirror `useDragAndDrop.ts`).
- Keep `formatUsd` as the tooltip/everything-else formatter; `formatUsdCompact` is axis-only.