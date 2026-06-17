# Validation: Instructor Students Page — Real Data

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green (`docker-compose up -d` first for integration).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `server/entities/instructor/students.test.ts` — `getStudentsInput`: `{}` → `{ status: "all", sort: "recent", page: 1 }`; unknown `sort` throws; `q` is trimmed; `page: 0` throws.
- `server/services/instructor/instructor.service.test.ts` — `getStudents`: maps `RawStudentRow[]` → `StudentRow[]` (`progress` → `overallProgress`, `last_active_at` → `lastActiveAt`, `joined_at` → `joinedAt`), computes `lastPage = ceil(total/10)` (23 → 3), `perPage = 10`, passes a `cutoff` ~7 days before now to the repo; empty result → `lastPage: 1`, `data: []`.
- `server/services/instructor/instructor.service.test.ts` — `getStudentStatusCounts`: returns the repo counts object unchanged.
- `app/_components/Instructor/Students/utils.test.ts` — `getInitials("Sarah Johnson") === "SJ"`, `getInitials("madonna") === "M"`; `formatLastActive(null) === "Never"`; a recent date → string matching `/ago/`; `statusBadgeClass` returns green/blue/gray per status.
- `app/_components/Instructor/Students/searchParams.test.ts` — `parseStudentsSearchParams`: empty params → defaults (`q:""`, `status:"all"`, `courseId:"all"`, `sort:"recent"`, `page:1`); valid params read through; invalid `status`/`sort` enums fall back to defaults; non-positive/non-numeric `page` coerces to 1; a repeated param takes the first value. `toStudentsInput`: trims `q` (empty → `undefined`), maps `courseId:"all"` → `undefined`, passes a real `courseId` through.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `EnrollmentRepository.findInstructorStudents`:
  - One row per student; only **this instructor's** non-soft-deleted courses are aggregated (a foreign instructor's enrollment is excluded from `courses` and from the row count).
  - `overallProgress` is the rounded average of the student's enrollment progress.
  - Derived status: all-completed enrollments → `completed`; most recent `lastAccessedAt` older than `cutoff` (or null) → `inactive`; otherwise `active`.
  - `status: "active"` filter and cancelled-only students → `total: 0`, `rows: []` (cancelled enrollments excluded).
- `EnrollmentRepository.getInstructorStudentStatusCounts`:
  - Counts students by derived status; `active + completed + inactive === total`.
  - Instructor with no students → `{ total: 0, active: 0, completed: 0, inactive: 0 }`.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Total Students count) | `getInstructorStudentStatusCounts` integration test; Manual #1 |
| FR2 (Active/Completed/Inactive sum to Total) | `getInstructorStudentStatusCounts` integration test (`active+completed+inactive===total`); Manual #1 |
| FR3 (zero students → all cards 0) | `getInstructorStudentStatusCounts` "no students" integration test; `getStudents` empty-result unit test; Manual #7 |
| FR4 (row fields incl. avatar/initials fallback) | `findInstructorStudents` integration test; `utils.test.ts` (`getInitials`); Manual #2 |
| FR5 (≤2 course badges + "+N more", full list elsewhere) | `findInstructorStudents` (`courses` array, foreign excluded); Manual #2, #4 |
| FR6 (overall progress = rounded avg) | `findInstructorStudents` (`progress: 40`); `getStudents` unit test; Manual #2 |
| FR7 (last-active relative time, "Never" when null) | `utils.test.ts` (`formatLastActive`); Manual #2 |
| FR8 (derived status badge) | `findInstructorStudents` status-derivation integration test; Manual #2 |
| FR9 (empty state) | `StudentsTable` empty branch; Manual #5, #7 |
| FR10 (case-insensitive name/email search, server-side) | `findInstructorStudents` `searchClause` (`ILIKE`); Manual #3 |
| FR11 (status filter) | `findInstructorStudents` status-filter integration test; Manual #4 |
| FR12 (course filter = instructor's courses only) | `findInstructorStudents` `courseClause`; `course.getOwnCourses` dropdown source; Manual #4 |
| FR13 (sort recent/name/progress over full set) | `findInstructorStudents` `orderBy` (covered via name-sort assertion); Manual #6 |
| FR14 (server-side pagination preserves filters) | `getStudents` pagination unit test (`lastPage`); `useStudentsUrl` resets `page` on any filter change; `searchParams.test.ts` (page parsing); Manual #6 |
| FR15 (details dialog identity + overall progress) | `StudentDetailsDialog` renders from `StudentRow`; Manual #8 |
| FR16 (dialog per-course progress + completed/in-progress) | `findInstructorStudents` `courses[]`; `StudentDetailsDialog`; Manual #8 |
| FR17 (instructor-only, session-scoped, no cross-instructor leak) | `findInstructorStudents` "excludes other instructors" assertions; `instructorProcedure` gating; Manual #9 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # dev server
# Seed: an INSTRUCTOR account owning ≥1 published course with several enrolled students whose
# enrollments vary in progress, status (active/completed/cancelled), and lastAccessedAt
# (some within 7 days, some older, some null). A SECOND instructor with their own students.
```

1. **Stats cards:** Open `/instructor/students` as the seeded instructor → Total / Active / Completed / Inactive show real counts; Active + Completed + Inactive equals Total.
2. **Table row content:** Each row shows name, email, avatar (initials when no image), up to two of the instructor's course titles (+ "+N more" when applicable), progress bar with rounded %, a last-active relative time ("Never" for students who never accessed), and a status badge matching the derived rule.
3. **Search:** Type part of a student's name, then part of an email (different case) → list narrows to matches; clearing the field restores the full list. After the debounce settles, the URL gains `?q=…` and the list re-renders (RSC re-fetch) without a full page reload; the input keeps focus.
4. **Filters:** Select status = Inactive → only inactive students remain and the URL gains `?status=inactive`. Select a course from the dropdown (which lists only this instructor's courses) → only students enrolled in that course remain, and each remaining row still shows all of this instructor's courses that student is in.
4a. **URL as source of truth:** Apply a search + status + course + sort + page, copy the URL into a new tab → the same filtered/sorted/paged view loads directly from the URL. Use the browser Back button → the previous filter state is restored (the search input re-syncs from the URL).
5. **Combined filter empty state:** Apply a search + status combination that matches nobody → "No students found" empty state is shown (no crash, no stale rows).
6. **Sort + pagination:** With more than 10 students, sort by Name then Progress → ordering is correct across pages (not just the visible page). Use Next/Previous → page changes while the active search/filter/sort stay applied; changing any filter resets to page 1.
7. **Empty instructor:** Sign in as an instructor with no students → all four cards read 0 and the table shows the empty state.
8. **Details dialog:** Click ⋮ → "View Details" → dialog shows the student's name, email, avatar, status badge, join date, overall progress, and each enrolled course (this instructor's only) with its individual progress and Completed/In Progress badge. Confirm via the network tab that opening the dialog fires **no** additional request.
9. **Cross-instructor isolation:** Sign in as the second instructor → only their own students appear; none of the first instructor's students are visible, and counts reflect only the second instructor's base.

## Edge cases & regression

- **Cancelled-only student:** a student whose only enrollment in this instructor's courses is `cancelled` does not appear and is not counted (verified in `findInstructorStudents` and status-counts tests).
- **Null `lastAccessedAt`:** treated as inactive (when not completed) and rendered as "Never"; no date crash.
- **Numeric coercion:** `AVG(progress)` returns `ROUND(...)::int` and `COUNT(...)` returns `bigint`; the service coerces to JS `number` (integration + unit tests assert plain numbers, not `Decimal`/`bigint`).
- **Forged/foreign `courseId` filter:** narrows only within the instructor-scoped CTE → yields zero rows, never another instructor's data (FR17, no IDOR).
- **Page beyond range:** navigating (or editing `?page=`) to a page past `lastPage` returns an empty `data` array with correct `total`/`lastPage`; the table's prev/next buttons disable at the bounds.
- **Filter/total consistency:** row query and count run over identical predicates (`Promise.all`), so `total`/`lastPage` always match the filtered set across pages.
- **Regression — dashboard stats:** the existing `getInstructorStudentStats` (dashboard) is untouched; its tests remain green.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted (status-filter/count consistency, numeric coercion, `json_agg` shape, cancelled-only exclusion, ILIKE parameterization, payload size).
- [ ] No references to the mock `studentsData` / `courses` arrays remain in `app/instructor/students/page.tsx`.
- [ ] CLAUDE.md updated if the instructor router's new queries warrant a mention (instructor section).