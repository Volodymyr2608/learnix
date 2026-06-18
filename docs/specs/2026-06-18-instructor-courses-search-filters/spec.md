# Spec: Instructor Courses — Search, Filters & Pagination

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Make `/instructor/courses` a server-rendered, URL-param-driven list, mirroring the existing
**Students** feature (`app/_components/Instructor/Students/` + `instructor.getStudents`), which
already solves the same problem (parse `searchParams` → tested parser → zod input → service →
repository → paginated result + client filter bar). The page reads `searchParams`, a tested
parser normalises them, a new `course.searchOwnCourses` procedure runs one filtered/sorted/paginated
query scoped to the instructor, and a client filter bar pushes URL updates. We **add** a new
procedure rather than change `course.getOwnCourses`, because that procedure is also consumed by the
Students page (`app/instructor/students/page.tsx`) which needs the full unpaginated list. No
`CourseCard` change; search covers `title`/`subtitle`/`description` only.

The rejected alternative — overloading `getOwnCourses` with params — would couple two unrelated
surfaces and risk regressing the Students page; a dedicated procedure keeps each caller's contract
clean.

## Architectural decisions referenced

- **Three-layer pattern (CLAUDE.md):** router → `CourseService` → `courseRepository`. New query
  logic lives in the repository; the service method is a thin pass-through for consistency with
  the newer `getCoursesStats` flow.
- **Students feature precedent** (`app/_components/Instructor/Students/searchParams.ts`,
  `server/entities/instructor/students.ts`): copy its parser shape, zod-input-with-defaults, and
  `Paginated*` return shape.
- **Browse pattern** (`app/dashboard/browse/page.tsx`, `CoursePagination`, `useBrowseSearch`):
  copy the debounced-search + `buildHref` + reusable pagination approach.

## Data model

No schema changes. Query relies on existing columns/relations on `Course`
(`title`, `subtitle`, `description`, `status`, `category`, `updatedAt`, `createdAt`,
`instructorId`, `deletedAt`, `thumbnailUrl`) and the `enrollments` relation (for the
"Most students" sort via Prisma relation `_count`). No new index is required for the expected
catalogue size; an `instructorId`-scoped query over a single instructor's rows is small.

## API & contracts

New entity `server/entities/course/ownCourses.ts`:

```ts
export const getOwnCoursesInput = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["all", "draft", "published"]).default("all"),
  category: z.string().optional(),                 // lowercased category; omitted = all
  sort: z.enum(["updated", "newest", "oldest", "title", "students"]).default("updated"),
  page: z.number().int().min(1).default(1),
});
export type GetOwnCoursesInput = z.infer<typeof getOwnCoursesInput>;

export type OwnCourseRow = {
  id: string; title: string; status: CourseStatus;
  updatedAt: Date; thumbnailUrl: string | null;
};
export type PaginatedOwnCourses = {
  data: OwnCourseRow[]; total: number;
  currentPage: number; lastPage: number; perPage: number;
};
```

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `course.searchOwnCourses` | `instructorProcedure` | `GetOwnCoursesInput` → `PaginatedOwnCourses` | `instructorId` taken from `ctx.session.user.id`, never from input. Read-only. |
| `course.getOwnCourses` | `instructorProcedure` | _(unchanged)_ | Left intact for the Students-page consumer. |

**Sort key → `orderBy` map** (all single cheap orderings):

| `sort` | `orderBy` |
|--------|-----------|
| `updated` (default) | `{ updatedAt: "desc" }` |
| `newest` | `{ createdAt: "desc" }` |
| `oldest` | `{ createdAt: "asc" }` |
| `title` | `{ title: "asc" }` |
| `students` | `{ enrollments: { _count: "desc" } }` |

**Where clause** (always AND-ed, never widens scope):

```ts
{
  instructorId, deletedAt: null,
  ...(status !== "all" ? { status } : {}),
  ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
  ...(q ? { OR: [
    { title:       { contains: q, mode: "insensitive" } },
    { subtitle:    { contains: q, mode: "insensitive" } },
    { description: { contains: q, mode: "insensitive" } },
  ] } : {}),
}
```

## Component / data flow

```
/instructor/courses?q=&status=&category=&sort=&page=
        │
        ▼
page.tsx (server)
  parseOwnCoursesSearchParams(searchParams) ──► OwnCoursesQueryState  (clamped, defaulted)
        │
        ▼
<OwnCourses query=…>  (server component)
  ├─ searchOwnCourses(toInput(query))  ─► api.course.searchOwnCourses ─► CourseService ─► repo
  │        returns { data, total, currentPage, lastPage, perPage }
  ├─ <OwnCoursesFilters query/>   (client: search Input + status/category/sort Selects)
  │        on change → useOwnCoursesUrl → buildOwnCoursesHref(next) → router.push  (page→1 on filter/search change)
  ├─ data.length > 0 → grid of <CourseCard/>   |   else → empty-state text
  └─ lastPage > 1 → <CoursePagination buildHref={p => buildOwnCoursesHref({...query, page:p})} … />
```

## File list

**New**
- `server/entities/course/ownCourses.ts` — `getOwnCoursesInput` zod schema + `OwnCourseRow` / `PaginatedOwnCourses` types.
- `app/_components/Course/components/OwnCourses/searchParams.ts` — `parseOwnCoursesSearchParams` (clamp/normalise) + `toSearchInput` (state → tRPC input), mirroring the Students parser.
- `app/_components/Course/components/OwnCourses/searchParams.test.ts` — unit tests for defaults, clamping, invalid values.
- `app/_components/Course/components/OwnCourses/types.ts` — `OwnCoursesQueryState`, `OwnCoursesProps`, `OwnCoursesFiltersProps`.
- `app/_components/Course/components/OwnCourses/constants.ts` — `STATUS_OPTIONS`, `SORT_OPTIONS` (label/value) for the Selects.
- `app/_components/Course/components/OwnCourses/helpers/buildOwnCoursesHref.ts` — pure `(state) => string`, omits defaults/empties; shared by filter bar and pagination.
- `app/_components/Course/components/OwnCourses/hooks/useOwnCoursesUrl.ts` — debounced search + filter/sort setters that build the href and `router.push`; resets `page` on filter/search change.
- `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/index.tsx` — client filter bar: search `Input` + status/category/sort `Select`s (replaces today's dead Input + two Buttons).
- `app/_components/Course/components/OwnCourses/components/OwnCoursesFilters/types.ts` — its prop types.

**Modified**
- `server/repositories/course.repository.ts` — add `searchOwnCourses(params)`: build where + orderBy, `Promise.all([findMany(skip/take/select), count])`, return `PaginatedOwnCourses` (`PAGE_SIZE = 9`).
- `server/services/course/course.service.ts` — add `searchOwnCourses(instructorId, input)` thin pass-through.
- `server/api/routers/course.ts` — add `searchOwnCourses` `instructorProcedure` with `getOwnCoursesInput`.
- `app/instructor/courses/page.tsx` — make `async`, accept `searchParams`, parse, pass `query` to `<OwnCourses>`.
- `app/_components/Course/components/OwnCourses/index.tsx` — `async`, props `{ query }`; fetch via action; render filter bar + grid/empty-state + pagination.
- `app/_components/Course/components/OwnCourses/actions/getOwnCourses.ts` — repurpose to call `api.course.searchOwnCourses(input)` and return `PaginatedOwnCourses`; keep exporting an `OwnCourse` type (now `PaginatedOwnCourses["data"][number]`) so `CourseCard/types.ts` is unaffected.

## Cross-cutting concerns

- **Security / authz:** `instructorProcedure` + where clause pinned to `instructorId = ctx.session.user.id` and `deletedAt: null`. Filters can only narrow, never widen (FR15). Input is zod-validated; `q` capped at 200 chars.
- **Error handling:** router wraps the call in the existing `handleServiceError` pattern (as `getOwnCourses` does); the action keeps its `try/catch` returning an empty `PaginatedOwnCourses` so the page degrades to an empty state rather than throwing.
- **Consistency / state:** URL is the single source of truth; the parser clamps `page ≥ 1` and the page caps the requested page at `lastPage` (as browse does) so a stale/oversized `page` still renders.
- **Performance:** exactly one `findMany` (≤9 rows, `select`-narrowed) plus one `count`, both AND-scoped to one instructor (NFR — bounded query, no N+1, no fetch-all).
- **UX:** changing any filter/search resets to page 1; pagination hidden when `lastPage === 1`; empty state is rendered text.

## Risks & mitigations

| Risk | L/I | Mitigation |
|------|-----|------------|
| Stored `Course.category` casing/slug differs from dropdown value | M/L | Match with `equals … mode: "insensitive"`; UI value derived from `CATEGORIES` the same way browse does. |
| Changing the action's return shape breaks `CourseCard` typing | L/M | Keep the `OwnCourse` type export name; its member shape (`id,title,status,updatedAt,thumbnailUrl`) is unchanged. |
| Requested `page` beyond results | M/L | Clamp to `lastPage` at render (browse precedent). |

## Rollout / migration

No env vars, no DB migration, no backfill. Pure additive feature behind the existing instructor
route gating; revert = delete the new files and restore the three modified call sites.