# Refund self-service — Slice 1: automatic decision — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria.

**Goal:** A student can submit a refund request for a paid course; the server re-checks the FR-S2
conditions under a per-student lock, stores the request with its FR-S5 snapshot, and returns
`auto_approved` or `auto_denied` naming the failed conditions.

**Architecture:** One pure function `decideRefund` holds the rules (A1, Q13, A3, D3, OQ-2) and is
unit-tested against AC-F3/F4. `refundService.requestRefund` authorizes the payment in one query
(C1), takes a Postgres advisory lock per student (C4), gathers the facts from the DB, calls
`decideRefund`, and inserts one `RefundRequest` row in the same transaction. Lessons a student opens
are recorded fail-closed in `getStudentLesson` (FR-P19), so the threshold counts real opens.

**Spec:** [`../spec.md`](../spec.md) (approved 2026-11-22), [`../security.md`](../security.md)
C1, C2, C4, C22, C24; [ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md).

**Track:** `pnpm classify` on 2026-11-22 → `STANDARD-OR-DIRECT` ("no new authority"), but it only
saw the docs diff on this branch. The slice adds a new student procedure on the money path, so it is
treated as **guarded**: the controls `security.md` assigns to this surface (C1, C2, C4, C22, C24)
each get a test in the task that owns the code. Re-run `pnpm classify` at `/qa` on the code diff.

### Scope of this slice

**In:** FR-S2 (all six conditions evaluated), FR-S5 (snapshot), FR-S6 (decision only), FR-S7
(one request per purchase), FR-S14 (automatic denial naming the condition), FR-P19 (opened-lesson
record, lesson page only), FR-P20 (server flag, request endpoint only), `Payment.paidAt`.

**Out (later slices):** every Stripe call (`refunds.create`, effects FR-P6–P15), the payout hold,
cron, appeals, admin, UI (Purchases row, refund page), emails, the tutor/quiz/study-guide gates
(FR-P19a), disputes as a data source.

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| P1 | After `auto_approved` the request stays `auto_approved`; no refund is made in this slice | No Stripe in scope; FR-S6 "refunded at once" lands with the Stripe slice | — (scope cut) |
| P2 | `hasOpenDispute` is always `false` in this slice; the rule and its unit test exist | No dispute state is stored anywhere yet (FR-P18 is a later slice) | — (scope cut, recorded as a known deviation) |
| P3 | A lesson counts as non-deleted only if both `lesson.deletedAt` and its `section.deletedAt` are null | Sections are soft-deleted too; a lesson in a deleted section is invisible to the student | EC-3 says "non-deleted lessons", silent on sections |
| P4 | `paidAt` null (payments made before this slice) → outside the window | Fail closed; no backfill from `createdAt`, which the spec says is not the payment time | Spec silent on legacy rows |
| P5 | Free text capped at 2000 characters | C22 asks for a length cap without a number | C22 |
| P6 | A "certificate" = the enrollment for the course has `completedAt` set | There is no certificate table; certificates are rendered from completed enrollments (`certificate.service.ts:12-43`) | Spec assumes a certificate entity |

Each is logged in `journal/ai-decision-log.md` in Task 8.

**Codebase anchors (verified during planning):**
- `Payment` model (`prisma/schema/payments.prisma:15-45`) — `status` `PaymentStatus` (`:1-6`:
  `pending|succeeded|failed|refunded`); no `paidAt`; `refundedAt @map("refunded_at")`.
- `Lesson.deletedAt @map("deleted_at")` (`prisma/schema/lesson.prisma:15`); `Section.deletedAt`
  (`prisma/schema/course.prisma:72-86`); `LessonProgress` has no "opened" field (`lesson.prisma:31-50`).
- `Enrollment @@unique([studentId, courseId])`, `completedAt` (`prisma/schema/enrollment.prisma:7-29`).
- Migrations: `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`; latest
  `20260830123000_concept_check_course_budget`.
- `finalizeCheckout` (`server/services/payments/payment.service.ts:112-165`) — the only Stripe read
  is `stripe.checkout.sessions.retrieve(sessionId)` at `:130`; status set to `succeeded` at `:138-144`.
- `getStudentLesson` (`server/services/lesson/lesson.service.ts:113-174`) — lesson found at
  `:115-149`; `touchLastAccessed(...).catch(logger.warn)` at `:154-158` swallows failures (do **not**
  copy); `return lesson` at `:164`. Router `server/api/routers/lesson.ts:36-44`.
- `studentProcedure = roleProcedure(Role.STUDENT)` (`server/api/trpc.ts:224`) — instructors and
  admins get FORBIDDEN (`:191-202`).
- Router/service/errors trio to mirror: `server/api/routers/review.ts:7-30` (try → service, catch →
  `handleServiceError`), `server/services/billing/billing.errors.ts` (`InvoiceNotFoundError extends
  DomainError` with `"NOT_FOUND"`); `DomainError` (`server/services/base/base.errors.ts:5-15`);
  `handleServiceError` (`server/utils/handleServiceError.ts:15-61`). Register in `server/api/root.ts:27-47`.
- `BaseRepository.transaction(cb: (tx) => Promise<R>)` (`server/repositories/base/base.repository.ts:536-547`)
  — repository methods use `this.db`, **not** `tx`; inside a transaction call `tx.<model>` /
  `tx.$queryRaw` directly (precedent `conceptCheck.service.ts:336-354`). Do not copy the
  `transaction(async () => …)` calls that ignore `tx` (`course.service.ts:39`).
- Base methods wrap Prisma errors into plain `Error` (`handleError`), so a P2002 is not detectable
  after them — the unique-violation path must use `tx` directly.
- No advisory lock or `FOR UPDATE` exists in the repo; the only concurrency precedent is atomic
  `INSERT … ON CONFLICT` (`server/repositories/quizAttempt.repository.ts:78-99`).
- Env boolean pattern: `z.string().transform((v) => v === "true").optional()` (`lib/env.js:27-34`),
  mirrored in `runtimeEnv` (`:121-151`).
- Tests: `vitest.config.ts` projects `unit` / `integration` (`:32-42`, `fileParallelism: false`);
  `test/db.ts:6-44` hard-coded `TABLES` for `truncateAll`; factories `test/factories.ts`
  (`makeUser :12`, `makeCourse :26`, `makeSection :46`, `makeLesson :56`, `makeEnrollment :66`,
  `makePayment :169`); integration pattern `server/services/quiz/quiz.service.integration.test.ts:1-60`;
  concurrency pattern `Promise.allSettled` at `quiz.service.integration.test.ts:373-391`.
- `server/api/studentSurface.contract.integration.test.ts:48-177` sweeps **every** procedure; a new
  procedure must satisfy it (input shapes at `:108`).

**Per-task conventions:** after the implementation step, `pnpm typecheck` + `pnpm check` clean
before committing; unit tests colocated `*.test.ts`, integration `*.integration.test.ts` against
`learnix_test`; services and repositories export singletons; arrow-function consts; errors extend
`DomainError` in `refund.errors.ts`.

## Global Constraints

- Window: `14 × 24 h` from `Payment.paidAt`, UTC; `paidAt + 14d − 1s` inside, `paidAt + 14d`
  outside; judged at submission (AC-F4, EC-1).
- Threshold: `min(3, ⌊L/2⌋)`; L = non-deleted lessons of the course at submission; opened lessons
  counted among the same set; a lesson opened twice counts once (AC-F3, EC-3).
- Account limit: fewer than **3** account-limit refunds in the last **12 months**; in this slice an
  account-limit refund = an `auto_approved` request (lost disputes come later).
- Counting refund of this course: an `auto_approved` request by the same student for the same course.
- Reasons (closed list, FR-S3): `too_easy`, `too_hard`, `thin_content`, `other`. No files.
- A foreign or non-`succeeded` payment id → `NOT_FOUND`, no row written (C1). Flag off →
  `NOT_FOUND` (C24).

## Review Focus

1. **Two tabs, same payment, simultaneous submit** → exactly one row; the second caller gets
   CONFLICT, not a 500. Pinned in Task 6.
2. **A lesson in a soft-deleted section** that the student opened → counted in neither L nor
   opened (P3). Pinned in Task 4.
3. **A refund request on a payment whose `paidAt` is null** → denied with `window`, never approved
   (P4). Pinned in Task 2 and Task 6.
4. **The opened-record write fails** → the lesson content is not returned (fail-closed, unlike
   `touchLastAccessed`). Pinned in Task 4.
5. **A student refunds course A, buys it again, requests again** → denied with `earlier_refund`
   (D3), and the second payment's request is allowed to exist (unique is per payment, not course).
   Pinned in Task 6.

---

## Task 1 — Schema: `paidAt`, `OpenedLesson`, `RefundRequest`

`code included: migration on the money path — the exact columns, keys and constraints are what is approved.`

- **Contract:** the database has `payments.paid_at`, an `opened_lessons` table keyed by
  (student, lesson), and a `refund_requests` table with one row per payment at most. Test helpers
  know the new tables.
- **Test:** `server/repositories/refundSchema.integration.test.ts` — inserting two
  `RefundRequest` rows for one `paymentId` violates the unique key; inserting the same
  (`studentId`, `lessonId`) into `opened_lessons` twice violates the primary key;
  `truncateAll()` empties both tables.
- **Files:** `prisma/schema/refund.prisma` (new), `prisma/schema/payments.prisma`,
  `prisma/schema/lesson.prisma`, back-relations in the `User`/`Course`/`Lesson` schema files,
  `prisma/migrations/20261122120000_refund_request_slice/migration.sql` (via `pnpm db:generate`),
  `test/db.ts`, `test/factories.ts` (`makePayment` gains `paidAt` defaulting to `new Date()`; new
  `makeRefundRequest`, `makeOpenedLesson`).
- **AC:** foundation for AC-F2, F3, F6, AC-C3.
- **Commit:** `feat(refund): schema for paidAt, opened lessons and refund requests`

```prisma
// payments.prisma — Payment
paidAt DateTime? @map("paid_at")

// refund.prisma
enum RefundReason   { too_easy too_hard thin_content other }
enum RefundDecision { auto_approved auto_denied }

model RefundRequest {
  id               String         @id @default(cuid())
  paymentId        String         @unique @map("payment_id")   // FR-S7, AC-C3
  studentId        String         @map("student_id")
  courseId         String         @map("course_id")
  reason           RefundReason
  text             String?        @db.VarChar(2000)            // C22, P5
  decision         RefundDecision
  failedConditions String[]       @map("failed_conditions")
  snapshot         Json                                          // FR-S5, shape = RefundSnapshot
  createdAt        DateTime       @default(now()) @map("created_at")
  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)
  student User    @relation("StudentRefundRequests", fields: [studentId], references: [id], onDelete: Restrict)
  course  Course  @relation(fields: [courseId], references: [id], onDelete: Restrict)
  @@index([studentId, decision, createdAt])   // account-limit count
  @@index([studentId, courseId, decision])    // earlier counting refund
  @@map("refund_requests")
}

// lesson.prisma
model OpenedLesson {
  studentId String   @map("student_id")
  lessonId  String   @map("lesson_id")
  openedAt  DateTime @default(now()) @map("opened_at")
  student User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lesson  Lesson @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  @@id([studentId, lessonId])                 // "opened twice counts once" (AC-F3)
  @@map("opened_lessons")
}
```

No backfill of `paid_at` (P4).

- [ ] Write the failing test · [ ] Run it, see it FAIL (tables do not exist) · [ ] Edit schema, `pnpm db:generate`, `pnpm generate`, update `test/db.ts` + factories
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 2 — The rules: `decideRefund`

- **Contract:** in `server/services/refund/refundRules.ts`:
  - `REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000`, `ACCOUNT_LIMIT = 3`;
  - `refundThreshold(lessonCount: number): number` = `min(3, ⌊L/2⌋)`;
  - `isInsideRefundWindow(paidAt: Date | null, now: Date): boolean` — `false` for `null`;
  - `decideRefund(facts: RefundFacts, now: Date): RefundDecisionResult` — `auto_approved` iff all
    six conditions hold; otherwise `auto_denied` with every failed condition, in the order
    `window, threshold, certificate, earlier_refund, account_limit, dispute`; the snapshot carries
    all facts, the threshold, `windowEndsAt`, `evaluatedAt` and each condition's boolean.
  Types in `server/entities/refund.ts`:
  `RefundCondition`, `RefundFacts { paidAt: Date | null; lessonCount; openedCount; hasCertificate;
  hasEarlierCountingRefund; accountLimitRefunds12m; hasOpenDispute }`,
  `RefundSnapshot`, `RefundDecisionResult { decision; failedConditions: RefundCondition[]; snapshot }`.
  Pure: no DB, no `Date.now()`.
- **Test:** `server/services/refund/refundRules.test.ts`
  - `refundThreshold` for L = 1…7 → `0, 1, 1, 2, 2, 3, 3`; L = 0 → 0; L = 20 → 3 (AC-F3).
  - window: `paidAt + 14d − 1s` inside; `paidAt + 14d` outside; `null` outside (AC-F4, P4).
  - all conditions hold → `auto_approved`, `failedConditions: []`.
  - each condition failing alone → `auto_denied` naming exactly it (six cases, incl. `dispute`).
  - opened = threshold passes, threshold + 1 fails; `accountLimitRefunds12m` 2 passes, 3 fails.
  - two failing → both named, in the fixed order.
  - snapshot holds `openedCount`, `lessonCount`, `threshold`, `accountLimitRefunds12m` (AC-F2).
- **Files:** `server/services/refund/refundRules.ts`, `server/services/refund/refundRules.test.ts`,
  `server/entities/refund.ts`
- **AC:** AC-F3 (formula), AC-F4, AC-F2 (decision + snapshot shape), AC-F5 (denial names condition)
- **Commit:** `feat(refund): pure automatic-decision rules`

- [ ] Write the failing test · [ ] Run it, see it FAIL (module missing) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 3 — `finalizeCheckout` records `paidAt` from the charge

- **Contract:** when `finalizeCheckout` marks a payment `succeeded`, it also sets `paidAt` to the
  Stripe charge's `created` (seconds → `Date`). The session is retrieved with
  `expand: ["payment_intent.latest_charge"]` — still one Stripe call. If the charge is not present
  on the session, `paidAt` stays `null` and the checkout still succeeds (P4 covers the result).
  The idempotent early return (`:121-127`) does not touch `paidAt`.
- **Test:** `server/services/payments/payment.service.test.ts` (Stripe mocked as today):
  - session with `payment_intent.latest_charge.created = 1_763_800_000` → `paymentRepository.update`
    called with `paidAt: new Date(1_763_800_000_000)` and `status: "succeeded"`;
  - `sessions.retrieve` called once, with the `expand` option;
  - session with a string `payment_intent` (not expanded) → `paidAt: null`, checkout resolves.
- **Files:** `server/services/payments/payment.service.ts:130-144`, `payment.service.test.ts`
- **AC:** spec FR terms "window" (`paidAt` set server-side in `finalizeCheckout` from the charge's `created`)
- **Commit:** `feat(payments): store paidAt from the Stripe charge`

- [ ] Write the failing test · [ ] Run it, see it FAIL (`paidAt` not passed) · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 4 — Opened-lesson record, fail-closed, and the counts

- **Contract:**
  - `openedLessonRepository.record(studentId, lessonId): Promise<void>` — idempotent insert
    (`createMany` with `skipDuplicates`).
  - `getStudentLesson` calls it after the lesson is found (`:149`) and before `return lesson`
    (`:164`), **awaited, not caught**: if it throws, the method throws and no content is returned.
  - `openedLessonRepository.countCourseLessons(tx: Prisma.TransactionClient, studentId: string,
    courseId: string): Promise<{ lessonCount: number; openedCount: number }>`. Both numbers are over the same set: lessons with `deletedAt` null whose section has `deletedAt`
    null and belongs to the course (P3).
- **Test:**
  - `server/repositories/openedLesson.repository.integration.test.ts`: course with 5 lessons; open
    lesson 1 twice → `openedCount 1`; open lesson 2 then soft-delete it → `lessonCount 4`,
    `openedCount 1`; a lesson in a soft-deleted section opened → in neither count; a lesson of
    another course opened → not counted.
  - `server/services/lesson/lesson.service.integration.test.ts` (extend or create): a student
    fetching a lesson gets an `opened_lessons` row (AC-C9, lesson-page half).
  - `server/services/lesson/lesson.service.test.ts` (unit, repository mocked): `record` rejects →
    `getStudentLesson` rejects and does not resolve with the lesson.
- **Files:** `server/repositories/openedLesson.repository.ts` (+ tests),
  `server/services/lesson/lesson.service.ts:149-164`, the lesson service tests.
- **AC:** AC-C9 (lesson page; the tutor half is FR-P19a, later), AC-F3 (deleted opened lessons,
  opened twice), Review Focus 2 and 4.
- **Commit:** `feat(lesson): record opened lessons, fail closed`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 5 — Server-side flag

- **Contract:** `REFUND_STUDENT_ENABLED` is declared in `lib/env.js` (server, boolean pattern of
  `:27-34`, optional → off when unset) and in `runtimeEnv`. `isStudentRefundEnabled(): boolean` in
  `server/services/refund/refundFlag.ts` returns `env.REFUND_STUDENT_ENABLED === true`. Added to
  `.env.example` and `.env.test.example` as `false`.
- **Test:** `server/services/refund/refundFlag.test.ts` — unset → `false`; `"true"` → `true`;
  `"1"` → `false`.
- **Files:** `lib/env.js`, `server/services/refund/refundFlag.ts` (+ test), `.env.example`,
  `.env.test.example`
- **AC:** C24 (used by AC-C24 in Task 6)
- **Commit:** `feat(refund): server-side student refund flag`

- [ ] Write the failing test · [ ] Run it, see it FAIL · [ ] Implement
- [ ] Run it, see it PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 6 — `refundService.requestRefund`

`code included: the per-student lock is a new concurrency pattern on the money path (C4).`

- **Contract:** `refundService.requestRefund(studentId: string, input: RefundRequestInput):
  Promise<{ requestId: string; decision: RefundDecision; failedConditions: RefundCondition[] }>`
  1. flag off → `RefundNotFoundError` (`NOT_FOUND`) (C24);
  2. inside one `db.$transaction(async (tx) => …)`:
     - take the per-student lock first (below);
     - load the payment **by `id` and `studentId` and `status: "succeeded"` in one query**; none →
       `RefundNotFoundError` (C1) — same error and message as the flag-off case;
     - an existing request for the payment → `RefundAlreadyRequestedError` (`CONFLICT`) (FR-S7);
     - gather facts via `tx`: counts (Task 4), `hasCertificate` (enrollment for student+course with
       `completedAt` not null, P6), `hasEarlierCountingRefund`, `accountLimitRefunds12m`
       (`auto_approved`, `createdAt ≥ now − 365 d`), `hasOpenDispute: false` (P2);
     - `decideRefund(facts, now)`; insert the row with the snapshot; return.
  3. a P2002 on `payment_id` (raised by `tx`, not a base-repository method) →
     `RefundAlreadyRequestedError`.
  Fact queries live in `server/repositories/refundRequest.repository.ts` as `tx`-taking methods.

```ts
// first statement inside the transaction. $executeRaw, not $queryRaw:
// pg_advisory_xact_lock returns void, which $queryRaw cannot deserialize.
await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${studentId}`}))`;
```

- **Test:** `server/services/refund/refund.service.integration.test.ts` (flag mocked on):
  - happy path: paid 3 days ago, 6 lessons, 2 opened → `auto_approved`; the row's snapshot has
    `openedCount 2`, `lessonCount 6`, `threshold 3`, `accountLimitRefunds12m 0` (AC-F2).
  - 4 lessons, 3 opened → `auto_denied`, `["threshold"]` (AC-F5).
  - completed enrollment → `["certificate"]`; `paidAt` 15 days ago → `["window"]`;
    `paidAt` null → `["window"]` (Review Focus 3).
  - earlier `auto_approved` request on another payment of the same course → `["earlier_refund"]`
    (Review Focus 5).
  - 3 `auto_approved` requests in the last 12 months → `["account_limit"]`; 3 that are 13 months old
    → approved.
  - student B with student A's payment id → `NOT_FOUND`; no row written (AC-C1).
  - a `pending` or `refunded` payment → `NOT_FOUND`.
  - second request on the same payment → `CONFLICT` (AC-F6, request half).
  - two concurrent requests on one payment (`Promise.allSettled`) → one fulfilled, one `CONFLICT`,
    one row (AC-C3, row half; Review Focus 1).
  - student with 2 `auto_approved` refunds sends 3 concurrent requests for 3 courses → exactly 1
    `auto_approved`, 2 `auto_denied` with `account_limit` (AC-C4).
  - flag off → `NOT_FOUND`, no row (AC-C24).
  - text `<img src=x onerror=alert(1)>` stored byte-for-byte as typed (AC-C22, storage half).
- **Files:** `server/services/refund/refund.service.ts`, `server/services/refund/refund.errors.ts`,
  `server/repositories/refundRequest.repository.ts`, the integration test.
- **AC:** AC-F2, AC-F5 (automatic denial), AC-F6 (one request), AC-C1, AC-C3 (row), AC-C4,
  AC-C22 (storage), AC-C24 (request endpoint)
- **Commit:** `feat(refund): request with automatic decision under a per-student lock`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] Break the lock on purpose (comment it out) and see AC-C4 go red, then restore
- [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 7 — `refund.request` tRPC procedure

- **Contract:** `refundRouter.request` = `studentProcedure.input(RefundRequestInputSchema).mutation`
  calling `refundService.requestRefund(ctx.session.user.id, input)`, errors through
  `handleServiceError`. Registered as `refund` in `server/api/root.ts`.
  `RefundRequestInputSchema` (in `server/entities/refund.ts`) =
  `z.object({ paymentId: z.string().min(1), reason: z.enum(RefundReason values),
  text: z.string().trim().max(2000).optional() }).strict()`.
  The student id is never an input (C1).
- **Test:**
  - `server/entities/refund.test.ts`: extra keys `amount` or `studentId` rejected (AC-C2, input
    half); reason outside the list rejected; text of 2001 characters rejected, 2000 accepted
    (AC-C22); no `files` key accepted (FR-S3).
  - `server/api/routers/refund.integration.test.ts` via `createCaller`: an instructor and an admin
    get `FORBIDDEN`; a student gets the service result.
  - `server/api/studentSurface.contract.integration.test.ts` stays green with the new procedure
    (add its input shape at `:108` if the sweep requires it).
- **Files:** `server/api/routers/refund.ts`, `server/api/root.ts`, `server/entities/refund.ts`,
  the tests above.
- **AC:** AC-C2 (input half), AC-C22 (length), AC-C1 (student id from the session)
- **Commit:** `feat(refund): refund.request procedure`

- [ ] Write the failing tests · [ ] Run them, see them FAIL · [ ] Implement
- [ ] Run them, see them PASS · [ ] `pnpm typecheck` + `pnpm check` clean · [ ] Commit

---

## Task 8 — Record what the slice changed

- **Contract:** `journal/ai-decision-log.md` has one entry for planning decisions P1–P6 (who
  proposed, how checked, `Why: TODO (me)`); `spec.md` Agent notes gain the certificate fact (P6)
  and the section rule (P3) **only if the author approves them**; spec `status` stays `planned`
  (the feature is not shipped — this is slice 1).
- **Test:** `pnpm vitest run server/services/_shared/conformance/specSections.contract.test.ts`
  green; `pnpm spec:sync` produces no unexpected diff.
- **Files:** `docs/specs/features/refund-self-service/journal/ai-decision-log.md`,
  `docs/specs/features/refund-self-service/spec.md`
- **AC:** Gate Docs (`documentation-process.md` §7)
- **Commit:** `docs(refund): record slice-1 planning decisions`

- [ ] Write the entries · [ ] Run the contract test and `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved — a non-trivial migration, a change on the money or crypto path, a guard regex where
a mistake is expensive. Here: Task 1 (migration) and Task 6 (the lock).

## Self-review

**Spec coverage — in this slice:**

| AC | Task | Covered |
|---|---|---|
| AC-F2 | 2, 6 | Decision + snapshot. "Refunded at once" → Stripe slice (P1) |
| AC-F3 | 2, 4 | Full |
| AC-F4 | 2 | Full |
| AC-F5 | 2, 6 | Automatic denial naming the condition. Refund-page text → UI slice |
| AC-F6 | 6 | One request per purchase. Appeal half → appeals slice |
| AC-C1 | 6, 7 | Request endpoint. Refund page and status endpoint → UI slice |
| AC-C2 | 7 | Extra input keys rejected. `refunds.create` args → Stripe slice |
| AC-C3 | 6 | One row. One `refunds.create` call → Stripe slice |
| AC-C4 | 6 | Full for automatic refunds; lost disputes → disputes slice |
| AC-C9 | 4 | Lesson page. Tutor → FR-P19a slice |
| AC-C22 | 6, 7 | Stored as typed, length cap. Rendering → UI/admin slices |
| AC-C24 | 6 | Request endpoint. Appeal endpoint → appeals slice |

**Deferred — not in this slice (each needs a later plan):** AC-F1, F7–F30, AC-F21 and the
Notifications table; AC-C5–C8, C11–C21, C23, C25, C26, C28, C29; AC-L1–L4, L7–L14. The Release
checklist (AC-L8) forbids turning the flag on before the hold and FR-P19a ship, so this slice ships
with the flag **off**.

**Guarded coverage:** C1 → Task 6 (one authorizing query) + Task 7 (id from session); C2 → Task 7;
C4 → Task 6 (lock, with a break-it check); C22 → Tasks 6–7; C24 → Tasks 5–6. Each has its own test.

**Contract clarity / type consistency:** `RefundCondition`, `RefundFacts`, `RefundSnapshot`,
`RefundDecisionResult`, `RefundRequestInput(Schema)` are defined once in `server/entities/refund.ts`
(Tasks 2, 7); `countCourseLessons(tx, studentId, courseId)` is defined in Task 4 and used in Task 6;
`RefundNotFoundError`, `RefundAlreadyRequestedError` in Task 6, mapped by Task 7.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it check (Task 6): without the advisory lock, the AC-C4 test fails; restored, it passes.
- Manual: with `REFUND_STUDENT_ENABLED=true` in `.env`, as a seeded student with a paid course, open
  two lessons and call `refund.request` (via a tRPC caller script or the Network tab) → response
  `auto_approved`; the `refund_requests` row has the expected snapshot. With the flag unset → NOT_FOUND.
- Validation against the spec: walk AC-F2–F6 and AC-C1–C4, C22, C24 above and record in
  `ai-decision-log.md` where the implementation differed from the spec (expected: P1–P6).
