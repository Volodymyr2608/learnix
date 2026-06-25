---
feature: mobile-responsive
status: planned
models: []
depends-on: []
---

## Purpose

Students need to use Learnix from phones and tablets (browsing courses, watching lessons,
messaging instructors), but the app today is desktop-only: the dashboard sidebar is a fixed
256px column with no collapse, and several pages use side-by-side panels that don't stack on
narrow viewports. This makes the student-facing product effectively unusable below ~1024px.

## Functional scope

- A responsive dashboard shell: below the `md` breakpoint, the sidebar becomes a slide-in drawer
  triggered by a left-panel button in the header; at `md` and above, the sidebar is fixed and can
  be toggled between a full (256px) and a collapsed icon-only (64px) rail via a left-panel toggle
  in the header. The collapsed/expanded preference is persisted in a cookie and restored on the
  next load (read server-side so the initial render matches, avoiding a flash). Collapsing snaps
  between layouts (no width animation) to keep labels from reflowing.
- A shared `Sheet`/drawer UI primitive, reusable by any feature that needs to swap a side panel
  for an overlay on small screens. Driven entirely by Tailwind breakpoints and Radix's own
  open-state — no JS viewport-detection hook is introduced unless a concrete consumer needs one.
- The public marketing header exposes its nav links via a mobile drawer below `md` (currently
  hidden with no fallback).
- The lesson learning view (`CourseLearnView`) stacks to a single column below `lg`, and the
  course-outline/progress panel moves into the shared drawer on mobile instead of a sticky
  column.
- The messaging inbox/thread view shows one panel at a time full-width below `md` (extending the
  existing `activeId` show/hide pattern), with a back action to return to the inbox.
- Browse/course-detail/account pages have no horizontal overflow and no broken layouts between
  375px and 1024px viewport widths.
- Out of scope for this feature: the instructor portal (course editor drag-and-drop curriculum,
  analytics charts, data tables) — deferred to a later pass.

## Acceptance criteria

- On a 375px-wide viewport, a signed-in student can open the dashboard, tap a left-panel button to
  reveal the sidebar drawer, navigate to a different section via a drawer link, and have the
  drawer close automatically.
- On a desktop (≥`md`) viewport, toggling the header's left-panel button collapses the sidebar to
  an icon-only rail (and expands it back); after a full page reload the sidebar keeps whichever
  state it was last left in.
- On a 375px-wide viewport, no dashboard, lesson-view, messaging, browse, or account page causes
  horizontal scrolling of the page body.
- On a 375px-wide viewport, a student can open a lesson, watch the video (full width), and access
  the course outline/progress panel via a drawer trigger rather than a sticky sidebar.
- On a 375px-wide viewport, a student can view their inbox, open a thread (full width, replacing
  the inbox view), and return to the inbox via a back action.
- On viewports ≥1024px (`lg`+), all of the above pages render pixel-identical to their current
  desktop layout (no regression).
- The marketing homepage nav is reachable on a 375px viewport via a hamburger drawer.

## Agent notes

- `Dashboard/Sidebar/index.tsx` is an **async Server Component** (awaits `getSession()`, fetches
  unread-message/review counts). The mobile drawer needs client-side open/close state, so the
  open/close state must live in a separate client component/context — do not convert the sidebar
  itself to a client component to get state, or the server data-fetching breaks.
  See [[feedback_spec_driven_workflow]].
- There is no existing `Sheet`/`Drawer` primitive in `app/_components/_shared/ui/` — it is
  net-new (built on `@radix-ui/react-dialog`, already a dependency) and should be reused by
  later mobile work (e.g. the instructor portal pass) rather than rebuilt.
- Use `dvh` (dynamic viewport height) instead of `vh` for any full-height drawer/panel so mobile
  browser chrome (address bar show/hide) doesn't cause layout jumps.
- This feature ships in stages: a foundation PR (shell + shared primitives + marketing nav), then
  one PR per page area (lesson view, messaging, browse/account polish). Each stage's tasks live
  in `build/plan.md`, extended incrementally — do not write a single plan covering all stages
  before the foundation lands, since later stages reuse primitives built in the foundation.