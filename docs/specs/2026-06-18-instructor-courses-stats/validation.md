# Validation: Real Data for OwnCoursesStats (Instructor Courses Page)

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` — green, including the new `server/services/course/course.service.test.ts`.
<!-- No integration-test changes: enrollmentRepository.getInstructorStudentStats and
     paymentRepository.getInstructorRevenueStats are pre-existing, reused as-is, and were never
     covered by a *.integration.test.ts — only by mocked unit tests (instructor.service.test.ts,
     payment.service.test.ts). This feature follows that same precedent. -->

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `CourseService.getCoursesStats`: given mocked `courseRepository.getCoursesStats`, `enrollmentRepository.getInstructorStudentStats`, and `paymentRepository.getInstructorRevenueStats`, assembles them into one `CourseOwnerStats` object with the exact shape `{ total, draft, published, lastCourses, students: { total, newThisMonth }, revenue: { lifetimeGrossCents, thisMonthGrossCents } }`, and passes `instructorId` through to all three calls.
- `CourseService.getCoursesStats`: with all three repositories returning zeroed stats, returns a fully zeroed `CourseOwnerStats` (no crash, no fallback to mock numbers).
- `CourseService.getCoursesStats`: when any one repository call rejects, the method rejects with the same error (no swallowing).

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (Total Students card) | Unit test "assembles course, student, and revenue stats into one DTO" (`students.total`); Manual scenario 1 |
| FR2 (Total Students subline) | Same unit test (`students.newThisMonth`); Manual scenario 1 |
| FR3 (Total Revenue card) | Same unit test (`revenue.lifetimeGrossCents`); Manual scenario 1 |
| FR4 (Total Revenue subline) | Same unit test (`revenue.thisMonthGrossCents`); Manual scenario 1 |
| FR5 (zero state) | Unit test "returns zeroed values for a brand-new instructor"; `lib/requests/course/getCoursesStats.ts` fallback object (Task 3 Step 1); Manual scenario 2 |
| FR6 (cross-page consistency) | Both surfaces call the identical repository methods (`enrollmentRepository.getInstructorStudentStats`, `paymentRepository.getInstructorRevenueStats`) — no duplicated logic to diverge; Manual scenario 3 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d   # local Postgres
pnpm dev                # http://localhost:3000
```
Sign in as an instructor account that owns at least one published course with real enrollments and at least one succeeded payment this calendar month (or use Prisma Studio / `pnpm db:studio` to seed one).

1. **Real data renders:** Visit `/instructor/courses`. Expected: "Total Students" shows the real distinct active-student count for this instructor (not `1,234`), with subline "+N enrollments this month"; "Total Revenue" shows the real lifetime gross as USD (not `$12,450`), with subline "+$N this month". "Total Courses" and "Published" cards are unchanged from before.
2. **Zero state for a new instructor:** Sign in as (or create) an instructor with no courses, no students, no sales. Visit `/instructor/courses`. Expected: "Total Students" shows `0` / "+0 enrollments this month"; "Total Revenue" shows `$0` / "+$0 this month". No runtime error, no leftover mock numbers.
3. **Cross-page consistency:** For the instructor from scenario 1, open `/instructor` (dashboard) in another tab. Expected: the dashboard's "Total Students" and "Total Revenue" stat cards show the same numbers as `/instructor/courses`'s "Total Students" and "Total Revenue" cards (lifetime gross / total active students match exactly; "this month" figures may differ in framing — dashboard shows a % delta, courses page shows an absolute "+N this month" — but the underlying totals agree).
4. **Two instructors, two answers:** Repeat scenario 1 with a second instructor account that has different students/sales. Expected: the two instructors see different, correct figures — never the other's data.

## Edge cases & regression

- **No active enrollments but a cancelled one exists:** a student whose only enrollment in this instructor's course is cancelled must not count toward "Total Students" (matches `getInstructorStudentStats`'s existing `status = active` filter — no new logic, but worth eyeballing once via Prisma Studio against scenario 1's instructor).
- **Refunded payment:** a refunded sale must not inflate "Total Revenue" (matches `getInstructorRevenueStats`'s existing `refundedAt = null` filter).
- **Transient repository failure:** temporarily stub one of the three repository calls to throw (or run unit test 3) — the page must fall back to the zeroed `getCoursesStats` request-helper object rather than crashing the page (existing `lib/requests/course/getCoursesStats.ts` catch block, now extended).
- **Existing cards unaffected:** "Total Courses" and "Published" values and sublines must be pixel-identical to before this change for the same instructor (Task 3 doesn't alter their data source, only extracts shared markup into `StatCard`).

## Definition of done

- [ ] All automated checks green (`pnpm typecheck`, `pnpm check`, `pnpm test:unit`); new code covered by the `CourseService.getCoursesStats` unit tests.
- [ ] Every FR in `requirements.md` traces to a passing check above (see Traceability table).
- [ ] All four manual scenarios pass.
- [ ] Both risks in `spec.md` (drift between courses page and dashboard; `StatCard` extraction altering existing cards) are mitigated per the Edge cases section above.
- [ ] No remaining references to the old mock values (`1,234`, `$12,450`, `+87`, `+$1,230`) anywhere in `app/_components/Course/components/OwnCoursesStats/`.