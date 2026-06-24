# Validation: Instructor Dashboard — Real Stat Cards

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` and `pnpm test:integration` — green.

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `lib/stats/monthWindows.ts` (`getMonthWindows`): for `2026-06-16` returns `startThisMonth=2026-06-01`, `startLastMonth=2026-05-01`, `startNextMonth=2026-07-01`; January input rolls `startLastMonth` back to the prior December; December input rolls `startNextMonth` forward to the next January.
- `lib/stats/computeDelta.ts` (`computeDelta`):
  - `(110, 100)` → `{ kind: "percent", value: 10, direction: "up" }`.
  - `(80, 120)` → `{ kind: "percent", value: -33, direction: "down" }` (rounds to whole number).
  - `(100, 100)` → `{ kind: "percent", value: 0, direction: "flat" }`.
  - `(50, 0)` → `{ kind: "new" }`.
  - `(0, 0)` → `{ kind: "none" }`.
- `server/services/instructor/instructor.service.ts` (`getDashboardStats`, repos mocked):
  - Assembles all four cards and computes deltas: revenue `110_000/100_000` → `+10% up`, students `13/12` → `+8% up`; returns `courses {published:8, drafts:2}` and `rating {average:4.8, reviewCount:245}`.
  - Brand-new instructor (all repos return zeros / `average:null`): every delta is `{ kind: "none" }`, `rating.average` is `null`, all totals `0`.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

Seed via the existing test factories (`test/factories.ts`), mirroring `payment.service.integration.test.ts` / `enrollment.integration.test.ts`.

- **Revenue stats** (`paymentRepository.getInstructorRevenueStats`): with succeeded payments split across this month and last month, returns the correct `lifetimeGrossCents` (sum of all succeeded, non-refunded), `thisMonthGrossCents`, and `lastMonthGrossCents`; a `refunded` payment and a `pending` payment are excluded from all three sums; another instructor's payments are excluded.
- **Student stats** (`enrollmentRepository.getInstructorStudentStats`): a student enrolled in two of the instructor's courses counts once in `total`; a `cancelled`/non-active enrollment is excluded; `thisMonthNew`/`lastMonthNew` count enrollments by `enrolledAt` window; enrollments in another instructor's course are excluded.
- **Rating stats** (`courseReviewRepository.getInstructorRatingStats`): returns the mean `rating` and count over the instructor's non-deleted reviews; a soft-deleted review is excluded; reviews on another instructor's course are excluded; with zero reviews returns `{ average: null, reviewCount: 0 }`.
- **End-to-end service** (`instructorService.getDashboardStats` against the DB): for a seeded instructor the assembled DTO matches the seeded ground truth (revenue total, distinct students, published/draft counts, average rating).

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Total Revenue value) | Revenue stats integration test; service unit test; manual scenario 1 |
| FR2 (Revenue delta + zero-handling) | `computeDelta` unit tests; revenue stats integration (window split); service unit test; manual scenarios 1 & 3 |
| FR3 (Total Students distinct) | Student stats integration test (dedupe); service unit test; manual scenario 1 |
| FR4 (Students delta + zero-handling) | `computeDelta` unit tests; student stats integration (window); service unit test; manual scenarios 1 & 3 |
| FR5 (Active Courses + drafts) | Service unit test (reuses `getCoursesStats`); manual scenario 1 |
| FR6 (Avg. Rating + empty state) | Rating stats integration test (incl. zero → null); service unit test; manual scenarios 1 & 3 |
| FR7 (Single fetch, one endpoint) | `getDashboardStats` RSC wrapper (Task 10) + page wiring (Task 12); manual scenario 1 (one network query) |
| FR8 (Authorization) | `instructorProcedure` on the endpoint (Task 9); manual scenario 4 (cross-instructor / role boundary) |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d          # local Postgres on 5433
pnpm dev                      # dev server
# Seed at least: one instructor with published + draft courses, paid enrollments
# (this month and last month), reviews; and one brand-new instructor with nothing.
# Use Prisma Studio (pnpm db:studio) to confirm ground-truth numbers.
```

1. **Populated instructor:** Sign in as the seeded instructor, open `/instructor`.
   → The four cards show the real values matching Prisma Studio: Total Revenue = sum of succeeded non-refunded `amountCents` formatted as `$N,NNN`; Total Students = distinct active students; Active Courses = published count with `"{n} drafts"`; Avg. Rating = mean rounded to 1 decimal with `"{n} reviews"`. Revenue and Students cards show a real `% from last month` with an up/down arrow.
2. **Revenue/students went down:** Seed last-month totals higher than this-month.
   → The Revenue and Students deltas render in red with a down arrow and the correct percentage.
3. **Brand-new instructor:** Sign in as the instructor with no courses/sales/reviews, open `/instructor`.
   → Total Revenue `$0` (not "Free"), Total Students `0`, Active Courses `0` with `"0 drafts"`, Avg. Rating `—` with "No reviews yet". No delta lines appear on Revenue/Students. No console/runtime errors.
4. **Authorization boundary:** As a STUDENT, attempt `api.instructor.getDashboardStats` (e.g. via the tRPC client / devtools).
   → Rejected with `UNAUTHORIZED`/`FORBIDDEN`; instructors only ever see their own figures (id is taken from the session, never the client).

## Edge cases & regression

- **Zero last month, sales this month:** delta shows "New this month", not a divide-by-zero or `Infinity%` (FR2/FR4).
- **Both months zero:** delta line is omitted entirely (`kind: "none"`).
- **Flat month-over-month:** shows "No change from last month" without a misleading arrow.
- **Distinct students:** a student in two of the instructor's courses is counted once (no double-count via `groupBy`).
- **Refunded / pending payments:** excluded from revenue totals and deltas.
- **Soft-deleted reviews/courses:** excluded from rating and course counts.
- **Transient backend failure:** the RSC wrapper returns the zeroed DTO so `/instructor` still renders (no crashed page).
- **Other three sections unchanged:** "Top Performing Courses", "Recent Activity", and "Revenue Overview" render exactly as before (still placeholder) — no regression from the page edit.

## Definition of done

- [ ] All automated checks green; new code covered by unit + integration tests.
- [ ] Every FR in `requirements.md` traces to a passing check above.
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` are mitigated or explicitly accepted (distinct-student `groupBy`, month-window unit tests, divide-by-zero handling).
- [ ] Docs updated where warranted (CLAUDE.md instructor section if the new endpoint is worth noting).