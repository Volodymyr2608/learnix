# Requirements: Instructor Students Page — Real Data

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned — instructor portal

Date: 2026-06-16 · Author: Volodymyr Pelykh · Stakeholders: instructor portal

## Problem

The instructor Students page (`app/instructor/students/page.tsx`) renders entirely from a
hardcoded `studentsData` array and a fixed `courses` list (`app/instructor/students/page.tsx:53`,
`:227`). Nothing on the page reflects the logged-in instructor's actual students:

- The stats cards (Total / Active / Completed / Inactive) count mock rows, not real enrollments.
- The table, search, status filter, course filter, sort, and "View Details" dialog all operate on
  the mock array, so every instructor sees the same eight fake students.
- The "Last Active" column shows hardcoded strings ("2 hours ago"), not real `lastAccessedAt` data.

All the underlying data already exists: `Enrollment` carries `status`, `progress`, `enrolledAt`,
`completedAt`, and `lastAccessedAt` (`prisma/schema/enrollment.prisma:7`), and the instructor
service/repository layer already has instructor-scoped query patterns
(`server/services/instructor/instructor.service.ts`, `enrollmentRepository.getInstructorStudentStats`).
The page is the last major instructor surface still on mock data after the dashboard was wired up.

## Goal

- An instructor sees only **their own** students — every learner enrolled in a course they own —
  with real per-student progress, enrolled-course list, status, and last-active time.
- The four summary cards report real counts for the instructor's student base.
- Search, status filter, course filter, and sort return correct real results and scale to hundreds
  of students without loading everything into the browser.
- The "View Details" dialog shows that student's real enrolled courses (this instructor's only) and
  their per-course progress.
- No student of another instructor is ever visible, and the page is reachable only by instructors.

## Scope decisions (locked)

1. **Display only — no actions this iteration:** "Export Data", per-student "Send Message", and
   "Export Progress" are removed or left as deferred no-ops. — Keeps scope to data wiring; messaging
   and export each need their own infra (templates, CSV) and can be separate features.
2. **Status is activity + completion based:** a student is **Completed** when all of *this
   instructor's* enrollments for that student are completed; **Inactive** when their most recent
   `lastAccessedAt` across this instructor's courses is older than 7 days (matching the existing
   inactive-student threshold in `notification.service.ts`); otherwise **Active**. — Mirrors the
   mock's three states with a defensible, already-used definition.
3. **Server-side pagination:** the list is paginated, searched, filtered, and sorted in the
   repository, not the client. — Real instructors may have hundreds of students; the current
   load-all-then-filter approach does not scale.
4. **This instructor's courses only:** "Enrolled Courses" and per-student "Progress" reflect only
   courses owned by the current instructor; progress is the average of that student's enrollment
   `progress` across this instructor's courses. — Privacy: an instructor must not see other
   instructors' courses or platform-wide enrollment.

## Assumptions & constraints

- A "student" is any `User` with at least one non-cancelled enrollment in a course owned by the
  current instructor (soft-deleted courses excluded, consistent with existing instructor queries).
- Progress source of truth is `Enrollment.progress` (0–100), already maintained by the learning flow.
- "Last Active" is derived from `Enrollment.lastAccessedAt`; it may be null for a student who
  enrolled but never opened the course, which must render gracefully (e.g. "Never").
- Access is gated to instructors via the existing `instructorProcedure`; instructor identity comes
  from the session, never from client input.
- Follows the three-layer pattern (router → service → repository) and component conventions in
  `CLAUDE.md` (colocated `types.ts`, no nested ternaries, sub-components for repeated layout).
- The inactive threshold of 7 days is fixed for this iteration (not user-configurable on this page).

## Functional requirements

### Summary stats

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Stats cards | "Total Students" shows the distinct count of students with a non-cancelled enrollment in any course the instructor owns. |
| FR2 | Stats cards | "Active", "Completed", and "Inactive" show the distinct student counts per the status definition in scope decision #2, and the three sum to Total. |
| FR3 | Stats cards | With zero students every card reads 0 (no crash, no mock fallback). |

### Students list (table)

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR4 | Table rows | Each row shows the real student name, email, avatar (initials fallback when no image), the instructor's courses they're enrolled in, overall progress %, last-active, and derived status. |
| FR5 | Enrolled-courses cell | Shows up to two of *this instructor's* course titles the student is in, plus a "+N more" badge when there are more; long titles truncate as today. |
| FR6 | Progress cell | Overall progress = average of the student's `Enrollment.progress` across this instructor's courses, rounded to a whole percent, shown as bar + number. |
| FR7 | Last-active cell | Shows a relative time from the student's most recent `lastAccessedAt` across this instructor's courses; renders a clear placeholder (e.g. "Never") when null. |
| FR8 | Status badge | Reflects the derived status (Active / Completed / Inactive) with the existing colour styling. |
| FR9 | Empty state | When the instructor has no students (or filters exclude all), the existing "No students found" empty state is shown. |

### Search, filter, sort, pagination

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | Search | Searching by name or email returns matching students; matching is case-insensitive and applied server-side. |
| FR11 | Status filter | Filtering by Active / Completed / Inactive returns only students with that derived status; "All Status" returns all. |
| FR12 | Course filter | The course dropdown lists only the instructor's own courses; selecting one limits the list to students enrolled in that course; "All Courses" returns all. |
| FR13 | Sort | Sort by Most Recent (enrollment recency), Name (A–Z), and Progress (high→low) order results correctly across the full result set, not just the current page. |
| FR14 | Pagination | The list is paginated server-side; navigating pages preserves the active search, filters, and sort. |

### Student details dialog

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR15 | Details dialog | "View Details" opens a dialog showing the student's name, email, avatar, derived status, join/enrollment date, and overall progress. |
| FR16 | Details dialog | The dialog lists each of *this instructor's* courses the student is enrolled in with that course's individual progress and completed/in-progress state. |

### Access control

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR17 | Authz | All data is fetched through an instructor-only procedure scoped to the session user; a non-instructor cannot reach the data and no other instructor's students are ever returned. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Instructor-scoped queries keyed on session user id; soft-deleted courses excluded; no cross-instructor data leakage. |
| Performance | List queries paginated and avoid per-row N+1 (aggregate progress/last-active/course list in bounded queries); page load comparable to the dashboard. |
| Accessibility / UX | Loading state while fetching; graceful null handling (no avatar, never-active); keyboard-usable filters and dialog as today. |
| Observability | Service-layer calls logged consistently with existing instructor service logging. |
| Data / privacy | Only name, email, avatar, and the instructor's own course progress are exposed; no other instructors' courses or platform-wide data. |

## Success metrics

- Two different instructors each see only their own students with correct counts and progress.
- Stats cards equal an independent count of the same enrollments in the database.
- List remains responsive (paginated) for an instructor with hundreds of students.
- Zero references to the mock `studentsData` / `courses` arrays remain in the page.

## Out of scope (deferred)

- Sending messages to students (email/notification) from this page.
- Exporting student or progress data (CSV/PDF).
- Configurable inactive-day threshold on this page.
- Showing courses owned by other instructors.
- Per-lesson progress breakdown inside the details dialog (course-level progress only).

## Open questions

- None — all scope decisions resolved.