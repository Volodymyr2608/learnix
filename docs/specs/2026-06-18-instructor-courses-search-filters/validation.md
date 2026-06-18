# Validation: Instructor Courses — Search, Filters & Pagination

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.

### Unit tests (`*.test.ts` — no DB)

- `server/entities/course/ownCourses.ts` (`getOwnCoursesInput`): empty object → `{ status: "all", sort: "updated", page: 1 }`; `q` trimmed and capped at 200; `page: 0` and unknown `sort` throw.
- `OwnCourses/searchParams.ts` (`parseOwnCoursesSearchParams`): empty params → `{ q:"", status:"all", category:"all", sort:"updated", page:1 }`; invalid `status`/`sort` fall back to defaults; `page` `"0"`/`"-5"`/`"abc"` → `1`; repeated param takes the first value.
- `OwnCourses/searchParams.ts` (`toSearchInput`): `q:"  "` → `undefined`; `category:"all"` → `undefined`; real values trimmed/passed through.
- `OwnCourses/helpers/buildOwnCoursesHref.ts`: all-default state → `/instructor/courses`; full state → `?q=react&status=draft&category=design&sort=title&page=3`; `status=published` with page 1 → `?status=published` (page omitted).

### Integration tests (`*.integration.test.ts` — `learnix_test`)

- `CourseRepository.searchOwnCourses` — scoping & pagination: 10 owned + 1 soft-deleted + 1 foreign → `total=10`, page 1 has 9 rows, `lastPage=2`, `perPage=9`, page 2 has 1 row; foreign/soft-deleted excluded.
- …status filter: `status:"draft"` returns only the draft.
- …category filter: `category:"development"` matches a `"Development"` course (case-insensitive).
- …multi-field search: `q:"rust"` matches by title, subtitle, and description (3 of 4 courses).
- …sort: `sort:"title"` → alphabetical; `sort:"students"` → course with more enrollments first.
- `CourseService.searchOwnCourses` — delegates to the repository and returns only the calling instructor's course.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (debounced multi-field search → `?q=`) | `parseOwnCoursesSearchParams`/`toSearchInput` unit; `searchOwnCourses` multi-field integration; manual #2 |
| FR2 (input pre-filled from `?q=`) | manual #2 (reload with `?q=`) |
| FR3 (clearing search removes `q`) | `buildOwnCoursesHref` unit (empty `q` omitted); manual #2 |
| FR4 (status filter sets `?status=` and filters) | `searchOwnCourses` status integration; manual #3 |
| FR5 (status control reflects `?status=`) | `parseOwnCoursesSearchParams` unit; manual #3 |
| FR6 (category filter sets `?category=` and filters) | `searchOwnCourses` category integration; manual #4 |
| FR7 (category control reflects `?category=`) | `parseOwnCoursesSearchParams` unit; manual #4 |
| FR8 (sort options reorder, set `?sort=`) | `searchOwnCourses` sort integration; manual #5 |
| FR9 (default order = recently updated) | `getOwnCoursesInput`/parser default unit; manual #1 |
| FR10 (≤9 per page) | `searchOwnCourses` pagination integration; manual #6 |
| FR11 (correct page count, `?page=` navigation) | `searchOwnCourses` `lastPage` integration; `buildOwnCoursesHref` page unit; manual #6 |
| FR12 (pagination hidden on single page) | `OwnCourses` render guard `lastPage > 1`; manual #1 |
| FR13 (filters combine; reset to page 1) | `searchOwnCourses` AND-where integration; `useOwnCoursesUrl` `FILTER_KEYS` reset; manual #7 |
| FR14 (empty state on no match) | `OwnCourses` empty guard; manual #8 |
| FR15 (instructor scoping, no widening) | `searchOwnCourses` scoping integration; `CourseService.searchOwnCourses` integration; manual #9 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d        # local Postgres on 5433
pnpm dev                    # dev server
# Sign in as an INSTRUCTOR who owns >9 courses spanning draft + published and ≥2 categories.
```

1. **Default load:** open `/instructor/courses` with no query string → courses listed most-recently-updated first; if ≤9 courses, no pagination control is shown.
2. **Search:** type `react` in the search box → after ~300ms the URL shows `?q=react` and the grid narrows to courses whose title/subtitle/description contain "react"; reload the URL → the input is still pre-filled with "react"; clear the box → `q` drops from the URL and the full (filtered) list returns.
3. **Status filter:** pick **Draft** → URL gains `?status=draft`, only drafts show, and the Status control reads "Draft"; pick **All Status** → `status` drops from the URL.
4. **Category filter:** pick a category → URL gains `?category=<slug>`, only that category shows; the control reflects the selection on reload.
5. **Sort:** pick **Title A–Z** → grid reorders alphabetically and URL shows `?sort=title`; pick **Most students** → courses with more enrollments come first.
6. **Pagination:** with >9 matching courses, the pager shows the right number of pages; clicking page 2 sets `?page=2` and loads the next slice.
7. **Combination + reset:** set a search term on page 2, then change the Status filter → results reflect both search AND status, and the page resets to 1 (`page` drops from the URL).
8. **Empty state:** search for a string that matches nothing → "No courses found." renders instead of an empty grid.
9. **Scoping regression:** confirm only your own courses ever appear under any filter; separately, open `/instructor/students` and confirm its **Course** dropdown still lists all your courses (the untouched `getOwnCourses` path).

## Edge cases & regression

- **Page beyond range:** `?page=99` → empty grid, pager clamps current page to `lastPage` (no crash).
- **Repeated/garbage params:** `?status=draft&status=published`, `?page=abc`, `?sort=bogus` → parser takes the first/falls back to defaults; page always renders.
- **IDOR / scope:** filters never return another instructor's or soft-deleted courses (asserted in integration + manual #9).
- **`CourseCard` untouched:** Students/Rating/Revenue tiles still render their `-` placeholders (out of scope).
- **Students page:** `course.getOwnCourses` and its consumer remain unchanged.

## Definition of done

- [ ] All automated checks green; new logic covered by unit + integration tests.
- [ ] Every FR in `requirements.md` (FR1–FR15) traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` mitigated: category case/slug (case-insensitive match — #4), `OwnCourse` typing (export name kept — typecheck), page beyond range (clamp — edge cases).
- [ ] `pnpm build` succeeds (RSC `searchParams` contract; no stale `getOwnCourses` import).