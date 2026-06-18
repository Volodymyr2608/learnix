# Requirements: Instructor Courses — Search, Filters & Pagination

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

- Date: 2026-06-18
- Author: Volodymyr Pelykh
- Surface: `/instructor/courses` (`OwnCourses` component)

## Problem

The instructor "My Courses" page renders every one of the instructor's courses in a
single unpaginated grid (`app/_components/Course/components/OwnCourses/index.tsx:8` calls
`getOwnCourses()` which returns all non-deleted courses with no filtering — see
`server/repositories/course.repository.ts:85`). The page already shows a search input and
two buttons ("All Status", "Sort By") but **none of them are wired to anything** — they are
static markup (`OwnCourses/index.tsx:15-18`). As an instructor's catalogue grows there is no
way to search, filter by status/category, sort, or page through courses, and the whole list
loads at once.

## Goal

- An instructor can find a specific course by typing part of its title.
- An instructor can narrow the list by publication status and by category.
- An instructor can reorder the list (recently updated, newest, oldest, title, most students).
- Long catalogues are paginated so only a single page of courses loads at a time.
- Search, filter, sort, and page state live in the URL so views are shareable and survive refresh.

## Scope decisions (locked)

1. **Server-side, URL-param driven:** state is read from `searchParams` and the data is fetched,
   filtered, sorted, and paginated on the server — mirroring the existing student browse page
   (`app/dashboard/browse/page.tsx`). Rules out client-side fetch-all-then-filter.
2. **Multi-field keyword search:** case-insensitive `contains` match `OR`-combined across
   `title`, `subtitle`, and `description`. No semantic search — only *published* courses are
   embedded (`CourseService.updateCourse:221-239`), so semantic search is structurally blind to
   drafts, is wired to the student/published scope, and conflicts with sort + pagination.
   `objectives` is excluded from search: it is a `String[]` (`course.prisma:19`) and substring
   matching inside array elements needs raw SQL, which is disproportionate for short bullet text.
3. **Status filter values:** `All` / `Draft` / `Published`, matching the `CourseStatus` enum
   (`prisma/schema/course.prisma:1`).
4. **Category filter:** reuses the existing shared `CATEGORIES` list used by student browse.
5. **Sort options:** Recently updated (default), Newest, Oldest, Title A–Z, Most students.
   Revenue and rating sorts are **excluded** — revenue is a payment-sum (not a sortable column)
   and rating sort was not requested; this keeps every sort a single cheap DB `orderBy`.
6. **Page size = 9** (3×3 grid), matching the student browse page.
7. **No `CourseCard` changes:** the Students / Rating / Revenue tiles on the card keep their
   current `-` placeholders. Card data enrichment is explicitly out of scope.
8. **Reuse `CoursePagination`:** the existing pagination component is reused, not re-built.

## Assumptions & constraints

- The page is already behind `instructorProcedure` / instructor routing; ownership scoping
  (`instructorId = current user`) is unchanged.
- `CATEGORIES`, `CoursePagination`, and the debounced-search URL pattern (`useBrowseSearch`)
  already exist and are the reference implementations to follow.
- "Most students" sorts by enrollment relation count (`orderBy: { enrollments: { _count } }`),
  which Prisma supports without raw SQL.

## Functional requirements

### Search

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | Search input | Given the instructor types text, When ~300ms pass without further typing, Then the URL gains `?q=<text>` and the grid shows only the instructor's courses whose **title, subtitle, or description** contains that text (case-insensitive, `OR`-combined). |
| FR2 | Search input | Given `?q=` is present on load, When the page renders, Then the input is pre-filled with that value. |
| FR3 | Search input | Given the input is cleared, When the debounce fires, Then `q` is removed from the URL and all (otherwise-filtered) courses show again. |

### Status filter

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR4 | Status control | Offers `All`, `Draft`, `Published`. Selecting one sets `?status=draft\|published` (or removes it for `All`) and filters the grid to courses of that status. |
| FR5 | Status control | Given `?status=` is present on load, the control reflects the active status. |

### Category filter

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR6 | Category control | Offers `All` + every value in `CATEGORIES`. Selecting one sets `?category=<slug>` (or removes it for `All`) and filters the grid to that category. |
| FR7 | Category control | Given `?category=` is present on load, the control reflects the active category. |

### Sort

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR8 | Sort control | Offers Recently updated (default), Newest, Oldest, Title A–Z, Most students. Selecting one sets `?sort=<key>` and reorders the grid accordingly. |
| FR9 | Sort control | Given no `sort` param, the list is ordered by most-recently-updated. |

### Pagination

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR10 | Grid | At most 9 courses render per page. |
| FR11 | Pagination | Given more than 9 matching courses, `CoursePagination` shows the correct page count and the current page; navigating sets `?page=N` and loads that page's slice. |
| FR12 | Pagination | Pagination is hidden when there is only one page of results. |

### Combination & empty state

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR13 | All controls | Search, status, category, and sort apply together (logical AND for filters); changing a filter/search resets to page 1. |
| FR14 | Grid | When no courses match the active query, an empty-state message is shown instead of an empty grid. |
| FR15 | Scoping | All results are restricted to the signed-in instructor's own, non-deleted courses, regardless of filters. |

## Non-functional requirements

| Aspect | Requirement |
|--------|-------------|
| Security / authz | Results stay scoped to `instructorId = current user` and `deletedAt = null`; filters can never widen this. |
| Performance | One paginated query returning a page (≤9) plus a total count; no fetch-all-then-filter, no N+1. |
| Accessibility / UX | Controls are keyboard-operable; the empty state is announced as text, not a blank grid. |
| Consistency | Reuse `CoursePagination`, `CATEGORIES`, and the debounced-search URL pattern rather than re-implementing them. |

## Success metrics

- Instructors can locate a known course in one search without scrolling.
- The courses page issues a bounded query (one page + count) regardless of catalogue size.

## Out of scope (deferred)

- Any `CourseCard` change, including real Students / Rating / Revenue values.
- Semantic search over own courses, and substring search within `objectives`.
- Sorting by revenue or rating.
- Bulk actions, multi-select, or saved filter presets.

## Open questions

- None.