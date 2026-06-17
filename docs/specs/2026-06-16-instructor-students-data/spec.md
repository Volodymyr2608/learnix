# Spec: Instructor Students Page — Real Data

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Wire the Students page to real data with **two new instructor-scoped tRPC queries** plus a
reused one. `instructor.getStudents` returns a paginated, searched, filtered, sorted list of
*students* (one row per enrolled learner, aggregated across that student's enrollments in the
instructor's own courses); `instructor.getStudentStatusCounts` returns the four card totals.
The course-filter dropdown reuses the existing `course.getOwnCourses`.

Because a "student row" aggregates many `Enrollment` rows per user — average progress, max
`lastAccessedAt`, a JSON array of the instructor's courses, and a **derived** status
(Active / Completed / Inactive) — and because the status filter and the progress sort operate on
those aggregates, the generic `BaseRepository.paginate` cannot express it. The list is therefore a
single hand-written `$queryRaw` CTE (a `json_agg` per student + a derived-status `CASE`), with a
parallel `COUNT` over the same filtered set for the total. This mirrors the existing raw-SQL
`getInstructorStudentStats` already in the enrollment repository.

The page (currently a client component on mock arrays) is refactored into an **async Server Component**
that reads the filter/sort/page state from URL `searchParams`, fetches all three datasets server-side
in parallel (`Promise.all`) via thin `lib/requests/instructor/*` helpers (which call `api` from
`trpc/server`), and passes the results down to small client components. **URL search params are the
single source of truth** for `q`, `status`, `courseId`, `sort`, and `page` — a `useStudentsUrl` client
hook writes changes back to the URL inside a `useTransition`, and re-running the RSC re-fetches. This
makes filtered/paginated views shareable and bookmarkable and keeps fetching on the server. The
per-student `courses` array is returned inline on each list row, so the "View Details" dialog renders
from the already-loaded row with **no second round-trip**.

Key trade-off: **raw SQL aggregate** vs. load-all-then-aggregate-in-JS. We chose raw SQL so search,
status filter, sort, and pagination are all correct over the full result set and the page scales to
hundreds of students (scope decision #3). No new ADR is warranted — this follows existing patterns.

## Architectural decisions referenced

- **Three-layer pattern (router → service → repository)** — aggregation SQL lives in
  `enrollmentRepository`; the service coerces/rounds and shapes DTOs; the router gates and maps errors.
- **Procedure-level role gating (`server/api/trpc.ts`)** — both new queries are `instructorProcedure`;
  instructor id comes from `ctx.session.user.id`, never from client input (FR17).
- **`BaseRepository` raw-SQL escape hatch** — uses `this.db.$queryRaw`, consistent with the existing
  `getInstructorStudentStats`, when the query is beyond the generic CRUD/paginate surface.
- **Server-side RSC fetch (`trpc/server` via `lib/requests`)** — the page is an async Server Component
  that calls `lib/requests/instructor/{getStudents,getStudentStatusCounts,getOwnCourses}.ts`; each helper
  wraps `api.instructor.*` from `trpc/server` and degrades to an empty result on error. This matches the
  established `lib/requests/*` RSC-fetch convention used across the dashboard and instructor pages.
- **URL search params as state (Next.js App Router)** — `q`/`status`/`courseId`/`sort`/`page` live in the
  URL, parsed on the server by `searchParams.ts` (`parseStudentsSearchParams` → `toStudentsInput`) and
  written on the client by the `useStudentsUrl` hook (`useTransition`, default values dropped, any filter
  change resets `page`). Shareable/bookmarkable views; no client-side query cache for the list.
- **Component conventions (`CLAUDE.md`)** — colocated `types.ts`, extracted sub-components for repeated
  layout (cards, rows), no nested ternaries (status badge / details state become early-return helpers),
  flattened loading/empty states; sub-components own their own UI.

## Data model

**No schema changes, no migration, no backfill.** All data already exists:

- `Enrollment` (`prisma/schema/enrollment.prisma`) — `studentId`, `courseId`, `status`
  (`active | completed | cancelled`), `progress` (0–100), `enrolledAt`, `completedAt`,
  `lastAccessedAt`. Scoped to the instructor via the `course.instructorId` relation; indexed on
  `courseId` and `studentId`.
- `Course` (`prisma/schema/course.prisma`) — `instructorId`, `title`, `deletedAt` (soft-deleted
  courses excluded).
- `User` (`prisma/schema/auth.prisma`, `@@map("users")`) — `name`, `email`, `image`.

**Derived status (scope decision #2), computed in SQL per student:**

| Status | Rule |
|--------|------|
| `completed` | `bool_and(enrollment.status = 'completed')` over the student's non-cancelled enrollments in this instructor's courses |
| `inactive` | not completed **and** `MAX(lastAccessedAt)` is `NULL` or `< now() − 7 days` |
| `active` | otherwise |

The 7-day cutoff is computed in the service (`subDays(new Date(), INACTIVE_DAYS)`, `INACTIVE_DAYS = 7`,
matching `notification.service.ts`) and passed into the repository as a `Date` parameter.

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `instructor.getStudents` | `instructorProcedure` | `{ q?, status?, courseId?, sort, page }` → `PaginatedStudents` | Read-only; instructor id from session. Raw-SQL aggregate + parallel count. |
| `instructor.getStudentStatusCounts` | `instructorProcedure` | `void` → `StudentStatusCounts` | Read-only; single aggregate query; drives the 4 cards. |
| `course.getOwnCourses` | `instructorProcedure` *(reused)* | `void` → own courses | Populates the course-filter dropdown (id + title only used). |

### Input schema (`instructor.getStudents`)

```ts
z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["all", "active", "completed", "inactive"]).default("all"),
  courseId: z.string().cuid().optional(),         // a course owned by the instructor; absent = all
  sort: z.enum(["recent", "name", "progress"]).default("recent"),
  page: z.number().int().min(1).default(1),
})
```

`courseId` ownership is enforced implicitly: it only narrows within the instructor-scoped CTE, so a
foreign/forged id simply yields zero rows (no leakage).

### DTOs (`server/entities/instructor/students.ts`)

```ts
export type StudentStatus = "active" | "completed" | "inactive";

export type StudentCourseProgress = {
  courseId: string;
  title: string;
  progress: number;               // 0..100, this enrollment
  completed: boolean;             // enrollment.status === "completed"
};

export type StudentRow = {
  id: string;                     // user id (React key, dialog source)
  name: string;
  email: string;
  image: string | null;          // null → initials fallback (FR4)
  courses: StudentCourseProgress[]; // this instructor's courses only (FR5, FR16)
  overallProgress: number;        // rounded average across `courses` (FR6)
  lastActiveAt: Date | null;      // max lastAccessedAt; null → "Never" (FR7)
  joinedAt: Date;                 // min enrolledAt (FR15)
  status: StudentStatus;          // derived (FR8)
};

export type PaginatedStudents = {
  data: StudentRow[];
  total: number;                  // distinct students matching filters
  currentPage: number;
  lastPage: number;
  perPage: number;
};

export type StudentStatusCounts = {
  total: number;                  // FR1
  active: number;
  completed: number;
  inactive: number;               // active + completed + inactive === total (FR2)
};
```

## Component / data flow

```
app/instructor/students/page.tsx  (async Server Component)
        │  query = parseStudentsSearchParams(await searchParams)        // URL is the source of truth
        │  const [counts, courses, students] = await Promise.all([      // lib/requests/instructor/*
        │      getStudentStatusCounts(), getOwnCourses(), getStudents(toStudentsInput(query)) ])
        │
        └─ <PageShell title="Students" …>                              app/_components/_shared/components/PageShell
              ├─ <StudentsStatsCards counts={counts}/>
              ├─ <StudentsFilters query={query} courses={…}/>          ("use client") — search (debounced),
              │        └─ useStudentsUrl().update({…})  ──► router.push(?q&status&courseId&sort&page)
              │                                              (useTransition; filter change drops page)  ──┐
              └─ <StudentsResults students={students}/>                 ("use client" wrapper)            │
                       ├─ <StudentsTable … onPageChange={p=>update({page:p})}                             │
                       │        isLoading={isPending} onViewDetails={setSelectedStudent}/>                │
                       └─ <StudentDetailsDialog student={selected}/>    (renders from loaded row — no extra query)
                                                                                                          │
   URL change ──► Next.js re-runs the RSC ──► re-fetch via lib/requests ◄─────────────────────────────────┘

        lib/requests/instructor/getStudents.ts → api.instructor.getStudents   (trpc/server, instructorProcedure)
                        │
                        ▼
        instructorService.getStudents(instructorId, input)
        instructorService.getStudentStatusCounts(instructorId)
                        │  cutoff = subDays(now, 7)
                        ▼
        enrollmentRepository.findInstructorStudents({ instructorId, cutoff, ...filters, page, perPage })
        enrollmentRepository.getInstructorStudentStatusCounts(instructorId, cutoff)
                        │
                        ▼   $queryRaw
  WITH student_rows AS (
    SELECT e."studentId" AS id,
           AVG(e.progress)                              AS progress,
           MAX(e."lastAccessedAt")                      AS last_active_at,
           MIN(e."enrolledAt")                          AS joined_at,
           MAX(e."enrolledAt")                          AS recent_enrolled_at,
           bool_and(e.status = 'completed')             AS all_completed,
           json_agg(json_build_object(
             'courseId', c.id, 'title', c.title,
             'progress', e.progress, 'completed', e.status = 'completed')
             ORDER BY e."enrolledAt" DESC)              AS courses
    FROM enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE c."instructorId" = $instructorId
      AND c.deleted_at IS NULL
      AND e.status <> 'cancelled'
      [AND e."studentId" IN (SELECT "studentId" FROM enrollments WHERE "courseId" = $courseId)]
    GROUP BY e."studentId"
  ), enriched AS (
    SELECT s.*, u.name, u.email, u.image,
      CASE WHEN s.all_completed THEN 'completed'
           WHEN s.last_active_at IS NULL OR s.last_active_at < $cutoff THEN 'inactive'
           ELSE 'active' END                            AS status
    FROM student_rows s JOIN users u ON u.id = s.id
  )
  SELECT * FROM enriched
  WHERE ($q IS NULL OR name ILIKE $q OR email ILIKE $q)
    AND ($status = 'all' OR status = $status)
  ORDER BY <recent: recent_enrolled_at DESC | name: name ASC | progress: progress DESC>
  LIMIT $perPage OFFSET ($page-1)*$perPage;
  -- total: SELECT COUNT(*) over the same `enriched` + WHERE (no LIMIT/OFFSET), run via Promise.all
```

**Course filter vs. course list:** `courseId` narrows *which students appear* (the `IN` subselect),
but the per-student `courses` aggregation stays unrestricted, so a filtered row still shows all of the
instructor's courses that student is in (FR5 + FR12 reconciled).

**Status counts** reuse the same `student_rows`/`enriched` CTE and finish with
`SELECT count(*) total, count(*) FILTER (WHERE status='active') active, …` (no search/course/page).

## File list

**New**
- `server/entities/instructor/students.ts` — `StudentStatus`, `StudentCourseProgress`, `StudentRow`,
  `PaginatedStudents`, `StudentStatusCounts`, `GetStudentsInput` types + the `getStudents` input zod schema.
- `lib/requests/instructor/getStudents.ts` — RSC fetch helper wrapping `api.instructor.getStudents` (`trpc/server`); returns an empty `PaginatedStudents` on error.
- `lib/requests/instructor/getStudentStatusCounts.ts` — RSC fetch helper wrapping `api.instructor.getStudentStatusCounts`; returns zeroed counts on error.
- `lib/requests/instructor/getOwnCourses.ts` — RSC fetch helper for the course-filter dropdown.
- `app/_components/Instructor/Students/searchParams.ts` — `parseStudentsSearchParams` (URL → `StudentsQueryState`, validating enums/page) and `toStudentsInput` (state → tRPC `GetStudentsInput`, dropping `"all"`/empty sentinels).
- `app/_components/Instructor/Students/types.ts` — `StudentsQueryState` and `SelectedStudent`.
- `app/_components/Instructor/Students/hooks/useStudentsUrl.ts` — client hook that writes query state into the URL (`useTransition`, default values dropped, filter change resets `page`); exposes `{ update, isPending }`.
- `app/_components/Instructor/Students/hooks/useDebouncedValue.ts` — debounces the search input before it is written to the URL.
- `app/_components/Instructor/Students/StudentsStatsCards/{index.tsx,types.ts}` — the four count cards (extracted `StatCard`).
- `app/_components/Instructor/Students/StudentsFilters/{index.tsx,types.ts}` — search (debounced) + status + course + sort controls; reads `query`, writes via `useStudentsUrl`.
- `app/_components/Instructor/Students/StudentsResults/{index.tsx,types.ts}` — client wrapper that owns dialog open/selected state, renders the table, and routes page changes through `useStudentsUrl`.
- `app/_components/Instructor/Students/StudentsTable/{index.tsx,types.ts}` — table, extracted `StudentRow`, status badge helper, pagination, empty state, loading state (`isLoading` from the URL transition).
- `app/_components/Instructor/Students/StudentDetailsDialog/{index.tsx,types.ts}` — details dialog rendered from a `StudentRow` (built on `ScrollableDialog`).
- `app/_components/Instructor/Students/utils.ts` — `getInitials`, `formatLastActive` (date-fns `formatDistanceToNow`, "Never" when null), `statusBadgeClass`.
- `app/_components/_shared/components/PageShell/{index.tsx,types.ts}` — shared page header/layout shell (`title`, `description`, optional `action`, `children`).
- `app/_components/_shared/components/ScrollableDialog/{index.tsx,types.ts}` — shared scrollable dialog content/body primitives.

**Modified**
- `server/repositories/enrollment.repository.ts` — add `findInstructorStudents(params)` (raw-SQL CTE + parallel count → `{ rows, total }`) and `getInstructorStudentStatusCounts(instructorId, cutoff)`.
- `server/services/instructor/instructor.service.ts` — add `getStudents(instructorId, input)` and `getStudentStatusCounts(instructorId)`; coerce bigints to `number`, round `overallProgress`, compute the 7-day `cutoff`; log at info with `{ instructorId }`.
- `server/api/routers/instructor.ts` — add `getStudents` (input schema) and `getStudentStatusCounts` `instructorProcedure` queries, wrapped in `handleServiceError`.
- `app/instructor/students/page.tsx` — delete the mock `studentsData`/`courses` arrays and all inline logic; convert to an async Server Component that parses `searchParams`, fetches via `lib/requests/instructor/*` in parallel, and renders `<PageShell>` → `StudentsStatsCards` / `StudentsFilters` / `StudentsResults`.

> Note — divergence from the original design: state was moved from in-component React state (with a
> `Students/index.tsx` orchestrator using `api.*.useQuery`) to **URL search params + RSC server fetch**.
> `Students/index.tsx` no longer exists; its role is split between the RSC page and `StudentsResults`.

## Cross-cutting concerns

- **Security / authz:** both queries `instructorProcedure`, keyed on `ctx.session.user.id`. Every SQL
  path filters by `c."instructorId" = $instructorId` and `c.deleted_at IS NULL`; `courseId` only narrows
  inside that scope (forged id → empty result). No client-supplied instructor id; no cross-instructor or
  platform-wide data (FR17, privacy NFR).
- **Error handling:** router wraps service calls in `handleServiceError`; the client shows a loading
  skeleton while fetching and the existing "No students found" empty state when the result set is empty
  (FR9). A failed query surfaces a non-crashing error state rather than mock data.
- **Consistency:** `getStudents` runs its row query and count via `Promise.all` over identical filter
  predicates so `total`/`lastPage` always match the filtered set; status filter and progress sort apply
  to the aggregate, so paging is stable across pages (FR13, FR14).
- **Observability:** `getStudents`/`getStudentStatusCounts` log at info with `{ instructorId }` (and
  filter args for the list), matching existing instructor-service logging.
- **Performance:** one aggregate query per concern; `json_agg` builds the course list in-DB (no per-row
  N+1); joins use indexed columns (`Enrollment@@index(courseId)`, `courseId`/`studentId`); pagination via
  `LIMIT/OFFSET`; the search input is debounced (`useDebouncedValue`) before it is written to the URL, so
  the RSC re-fetch only fires once typing settles; the three RSC fetches run in `Promise.all` (performance NFR).

## Risks & mitigations

| Risk | Likelihood / impact | Mitigation |
|------|---------------------|------------|
| Derived-status filter + pagination return inconsistent totals | M / M | Status filter applied in the outer `enriched` select; count runs the same CTE+WHERE without LIMIT, both in one `Promise.all`. |
| `AVG(progress)` / `COUNT` come back as Postgres numeric/bigint | H / L | Coerce to `Number` and round `overallProgress` in the service; cover in integration test. |
| `json_agg` produces `Date`/JSON shape the DTO must trust | M / L | Build only primitive fields in `json_build_object`; map/validate in the service before returning. |
| Student with only cancelled enrollments | L / L | Excluded by `e.status <> 'cancelled'`; intentional per requirements ("non-cancelled enrollment"). |
| `q` ILIKE without escaping `%`/`_` | L / L | Bind as a parameter with wildcards added server-side; Prisma `$queryRaw` parameterizes (no injection); literal wildcards in user text are acceptable. |
| Large `courses` arrays inflate payload | L / L | Bounded by page size (≤ perPage rows); only 4 primitive fields per course. |

## Rollout / migration

No env vars, no migration, no feature flag. Additive: two new repository methods, two new service
methods, two new router queries, one new entity file, and one component tree; the page edit is the only
removal. Reverting is a single revert of the page (the new endpoints/methods are unused if not called).
`perPage` is a fixed server constant (e.g. 10) this iteration; configurability is out of scope.