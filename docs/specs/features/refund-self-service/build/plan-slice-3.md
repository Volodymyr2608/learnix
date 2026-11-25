# Refund self-service — Slice 3: refund effects — Implementation Plan

> **For agentic workers:** execute with `superpowers:executing-plans` in this session — the warm
> context is the cheapest place to run TDD loops (ADR-030). Dispatch a subagent only for work that
> *reads a lot and returns little*; reconnaissance goes to `Explore`, never `general-purpose`.
> Steps use checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance
> criteria. Slice 1: [`plan.md`](plan.md); slice 2: [`plan-slice-2.md`](plan-slice-2.md).

**Goal:** An automatically approved request is refunded at once through Stripe, and every refund —
self-service, a Dashboard refund arriving by webhook, or one the daily replay finds — applies the
FR-P6–P13 effects exactly once.

**Architecture:** ADR-037 §4. One effects function, `refundEffectsService.apply`, gated by one
compare-and-set on `payments.status` (`succeeded → refunded`); the database effects run in the same
transaction, the network effects (transfer reversal, interest recompute) after it commits (C8). The
self-service path calls `refunds.create` after the request transaction commits, lists refunds before
creating one, and leaves the request "processing" when Stripe fails (FR-S20). Webhook event handling
moves out of the route into a service that the daily job also feeds with replayed events (FR-P15).
Learning records are deleted per course after their minutes are archived per day, and every study
statistic reads live rows + archive (FR-P9, A11).

**Spec:** [`../spec.md`](../spec.md) FR-P6–P15, FR-S6, FR-S20; [`../security.md`](../security.md)
C2, C3, C5 (remainder), C7 (refunds, reversals), C8, C12 (no refund of a disputed charge), C25, C26,
AI-L13; slice-1 accepted risk "access continues after an automatic approval";
[ADR-037](../../../../adr/037-refund-payout-hold-and-money-consistency.md) §2, §4.

**Track:** `pnpm classify` on 2026-11-22 → **guarded** (money path, migration, new data classes).
Each control above gets its own test in the task that owns the code. `security-auditor` audits at
`/qa`; `llm-security-auditor` checks AI-L13 (stored AI artifacts deleted) and that no AI reader gains
access to refunded courses.

### Scope of this slice

**In:** FR-S6 (refund at once), FR-S20 (processing state, retried; student never sees Stripe's text),
FR-P6–P13 on three paths — self-service, Dashboard webhook, daily replay — FR-P14 (effects at
`refunds.create` success, exactly once), FR-P15 (replay `charge.refunded`), the C5 remainder (a refund
committed during a release ends in one reversal), C7 for refunds and reversals, AI-L13.

**Out (later slices):** the appeal and admin-exception paths (slice 8 — they call the same
`apply`), the lost-dispute path and stored dispute state (slice 4), the student UI and its texts
(slice 7), day-3 emails and admin "Retry" (FR-A11, slices 5/8), partial Dashboard refunds (FR-P16),
refund failure at the bank (FR-P27), double charge (FR-P17, AC-C13).

### Decisions made while planning (need the author's confirmation)

| # | Decision | Why | Spec gap it fills |
|---|---|---|---|
| R1 | `RefundRequest` gains `refundState` (`processing` / `refunded`), `stripeRefundId`, `refundError` (admin-only), `refundedAt` | FR-S20 needs a stored "processing or failed at Stripe" state; today every `auto_approved` row looks the same | Spec names the state, not where it lives |
| R2 | A partial `charge.refunded` (amount refunded < amount) applies **no** effects in this slice | FR-P16 says a partial Dashboard refund leaves access and records; today `handleRefund` treats it as full | FR-P16 is a later slice |
| R3 | A disputed charge at self-service: no `refunds.create`; the request stays `processing` with `refundError = "charge disputed"` | C12; the dispute state the student sees is slice 4 | C12 before stored dispute state exists |
| R4 | Revocation reasons: `dashboard_refund`, `admin_exception`, `lost_dispute`, and `refund_request` (self-service/appeal, reachable only if the course is completed while the refund is processing) | FR-P10 lists three reasons; the race case needs a fourth | FR-P10 silent on the request path |
| R5 | A repurchase (enrollment reactivated) clears the revocation fields and reopens the conversation | Otherwise a new certificate stays hidden and the student can never message about a course they own again | Spec silent on repurchase after D1/E2 |
| R6 | Replay cursor in a new one-row table (`stripe_replay_cursors`); the first run starts 30 days back (Stripe's retention); only `charge.refunded` is replayed in this slice | Refund-failure events drive FR-P27 (later); a replayed duplicate is harmless (C8) | Cursor storage and start |
| R7 | The daily job first retries `processing` refunds (batch 20), then replays events, then releases payouts | FR-S20 "retried"; releases must see refunds first | Retry owner and order |
| R8 | Completed-course counts on the dashboard and achievements are not filtered by revocation | A11: nothing the student already saw changes; the archive covers minutes and days, not courses | A11 vs E2 |
| R9 | `syncProgressAndFireEvents` never touches a cancelled enrollment | Today a fire-and-forget progress sync can set a refunded enrollment back to `completed` and re-issue the certificate | Found in recon |
| R10 | The migration moves existing `auto_approved` rows to `processing` | They were approved with no refund (slice 1, P1); with the flag off in production there are none there | Legacy slice-1 rows |
| R11 | The review is soft-deleted on every path (no-op where none exists) | Same outcome as FR-P13 with one rule; a self-service student cannot have one | — |

Each is logged in `discovery/ai-decision-log.md` in Task 16.

**Codebase anchors (verified during planning):**
- `paymentService.handleRefund(paymentIntentId)` (`server/services/payments/payment.service.ts:198-227`) — unconditional `status: refunded`, cancels the enrollment, reverses only `transferred`; no transaction, no CAS, partial refunds treated as full. Replaced by `refundEffectsService.apply`.
- `connectService.reverseTransfer` (`connect.service.ts:259-273`) — `transfers.createReversal(id, { refund_application_fee: false })`, no idempotency key, DB write after the call. `releasePayment` (`:140-211`) flags "Transferred after a refund" (`:153-159`).
- Webhook `app/api/stripe/webhook/route.ts` — `charge.refunded` at `:56-66`, dedup check `:45` / record `:91` (check-then-record), signature `:19-32`; `processedStripeEventRepository` (`server/repositories/payment.repository.ts:5-27`).
- `refundService.requestRefund` (`server/services/refund/refund.service.ts:31-120`) — transaction commits at `:112`; `hasOpenDispute` hard-coded false `:91`; `RefundRequestResult` `:16-20`. `RefundRequest` (`prisma/schema/refund.prisma:16-34`) has no outcome field.
- `refundRequestRepository` counts every `auto_approved` row as counting (`server/repositories/refundRequest.repository.ts:65-89`) — unchanged (C4: in-progress refunds count).
- Enrollment (`prisma/schema/enrollment.prisma`): `status active|completed|cancelled`, `progress`, `completedAt`, `@@unique([studentId, courseId])`. Reactivation in `enrollmentService.enrollInCourse` (`server/services/enrollment/enrollment.service.ts:73-79`). Race: `syncProgressAndFireEvents` (`server/services/lesson/lesson.service.ts:211`, `:245-255`).
- Certificates: no model; `listEarned` → `findCompletedByStudent` (`enrollment.repository.ts:97-113`, no status filter); PDF `app/api/certificates/[enrollmentId]/route.ts` → `certificateService.renderPdf` (`server/services/certificates/certificate.service.ts:12-26`, no status check).
- Learning records and their course paths: `LessonProgress`, `OpenedLesson`, `QuizAttempt` (via quiz → lesson), `LessonAssistantConversation`/`Message`, `ConceptCheck` (direct `courseId`), `LearningPathCache` (direct `courseId`); `ConceptMastery` kept. Deletes must not filter soft-deleted lessons (`lesson: { section: { courseId } }`).
- Study statistics: `lessonProgressRepository.getCompletedMinutesTotals` (`server/repositories/lessonProgress.repository.ts:57-83`), `getStudentLessonStats` (`:85-113`), `getDailyCompletedMinutes` (`:115-130`), `getCompletionDays` (`:132-142`), `countCompletedTotal` (`:38`); consumers `studentService.getProgressStats` / `getAchievements` / `getDashboardStats` / `computeStreak` (`server/services/student/student.service.ts:29-222`).
- Messaging: `Conversation` (`prisma/schema/message.prisma`, `@@unique([studentId, instructorId, courseId])`); `messagingService.send` (`server/services/messaging/messaging.service.ts:119-135`) checks membership only.
- Recommendations: `embeddingsService.recomputeUserInterest` (`server/services/embeddings/embeddings.service.ts:52-53`, reads `status = 'active'`); `recommendationsService.forUser` excludes `findEnrolledCourseIds` (active, completed) (`server/services/search/recommendations.service.ts:10-37`).
- Reviews: `CourseReview.deletedAt` is the only visibility lever; `createReview` (`server/services/review/review.service.ts:56-128`) — a soft-deleted row still occupies the unique key.
- Account deletion: `userRepository.anonymiseAccount` (`server/repositories/user.repository.ts:66-167`) deletes explicitly per table, never the user row.
- Payout job: `payoutJobService.run` (`server/services/payments/payoutJob.service.ts:74-95`); `PayoutRun` (`prisma/schema/payments.prisma`).
- Tests: Stripe mock with `vi.hoisted` (`server/services/payments/payoutHold.integration.test.ts:12-36`); factories `test/factories.ts` (none yet for `ConceptCheck`, `LearningPathCache`, assistant conversations); `test/db.ts` TABLES.

**Per-task conventions:** as slice 2 — `pnpm typecheck` + `pnpm check` clean before each commit;
unit `*.test.ts`, integration `*.integration.test.ts` on `learnix_test`; arrow consts; services and
repositories export singletons; every Stripe call that creates money movement carries an idempotency
key and is preceded by a list (ADR-037 §2).

---

## Task 1 — Schema: refund state, revocation, closed conversations, study archive, replay cursor

- **Contract:** `RefundRequest` has `refundState RefundState?` (`processing | refunded`),
  `stripeRefundId String? @unique`, `refundError String?`, `refundedAt DateTime?` (R1). `Enrollment`
  has `certificateRevokedAt DateTime?` and `certificateRevokedReason CertificateRevocationReason?`
  (R4). `Conversation` has `closedAt DateTime?`. New `StudyArchive` (`study_archive`: `studentId`,
  `day` timestamp at UTC midnight, `minutes`, `lessons`, `@@id([studentId, day])`) and
  `StripeReplayCursor` (`stripe_replay_cursors`: `id` text PK, `lastEventCreated` int, `updatedAt`).
  `PayoutRun` gains `refundsRetried` and `eventsReplayed` (int, default 0) for Task 12. Existing `auto_approved` rows become `processing` (R10).
- **Code included: migration backfill on the money path:**
  ```sql
  UPDATE "refund_requests" SET "refund_state" = 'processing'
   WHERE "decision" = 'auto_approved' AND "refund_state" IS NULL;
  ```
- **Test:** `server/repositories/refundEffectsSchema.integration.test.ts` — each new column and table
  round-trips; `study_archive` rejects a second row for the same student and day; `truncateAll`
  empties the new tables.
- **Files:** `prisma/schema/refund.prisma`, `enrollment.prisma`, `message.prisma`, new
  `prisma/schema/studyArchive.prisma` (with the cursor), migration
  `prisma/migrations/20261124120000_refund_effects/migration.sql` (via `prisma migrate diff`),
  `test/db.ts`.
- **AC:** prerequisite.
- **Commit:** `feat(refund): schema for refund state, revocation, archive and replay cursor`

- [ ] Failing test · [ ] See it FAIL · [ ] Schema + migration + `pnpm generate` · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 2 — Idempotent transfer reversal

- **Contract:** `connectService.reverseTransfer(payment)` lists the transfer's reversals first; if
  one exists it only records it; otherwise it creates one with `idempotencyKey: reversal:${paymentId}`;
  the status changes by CAS `transferred → reversed`. A second call reverses nothing (C7).
- **Test:** `server/services/payments/connect.service.test.ts` — existing reversal found → no
  `createReversal`; new reversal carries the key; CAS lost → no error.
- **Files:** `connect.service.ts`, `server/repositories/payout.repository.ts` (`markReversed`), test.
- **AC:** AC-C7 (reversals).
- **Commit:** `feat(refund): idempotent transfer reversal with list-before-retry`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 3 — Clear a course's learning records, archiving study minutes first

- **Contract:** `learningRecordsRepository.clearForRefund(tx, studentId, courseId)`: first adds, per
  UTC day of `lesson_progress.completedAt` for that course, the completed minutes and lesson count to
  `study_archive` (upsert-add); then deletes lesson progress, opened lessons, quiz attempts, tutor
  messages and conversations, concept checks and the learning-path cache for that course — including
  rows of soft-deleted lessons and sections — and sets `Enrollment.progress = 0`. Concept mastery is
  kept (FR-P9, AI-L13).
- **Test:** `server/repositories/learningRecords.repository.integration.test.ts` — each record type
  of course A deleted, course B untouched, concept mastery kept; archive rows equal the minutes and
  lessons per day; a second refund on the same day adds to the row; a soft-deleted lesson's progress
  is deleted too.
- **Files:** `server/repositories/learningRecords.repository.ts`, `test/factories.ts` (concept check,
  learning-path cache, assistant conversation), test.
- **AC:** AC-F14 (records part), AC-L13 / AI-L13.
- **Commit:** `feat(refund): clear a course's learning records after archiving study minutes`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 4 — Study statistics read live rows + archive

- **Contract:** `getCompletedMinutesTotals`, `getStudentLessonStats`, `getDailyCompletedMinutes`,
  `getCompletionDays` and `countCompletedTotal` add the student's archive rows to the live ones, so a
  refund changes none of lifetime minutes, the weekly chart, the week-over-week delta, the streak,
  study days, or the lessons-completed achievement metric (A11).
- **Test:** `server/services/student/studyStatsAfterRefund.integration.test.ts` — a student with
  completions of the refunded course today and on the previous streak days: each statistic from
  `studentService` is equal before and after `clearForRefund` (AC-F29).
- **Files:** `server/repositories/lessonProgress.repository.ts`, test.
- **AC:** AC-F29.
- **Commit:** `feat(refund): study statistics include the study archive`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 5 — Certificates: revoked ones are not served; progress sync leaves cancelled enrollments alone

- **Contract:** `listEarned` omits revoked certificates; `renderPdf` throws not-found for a revoked
  one, so the PDF route returns 404 even with a valid 30-day token (C25). Reactivating an enrollment
  clears `certificateRevokedAt/Reason` (R5). `syncProgressAndFireEvents` skips a cancelled enrollment
  (R9).
- **Test:** `server/services/certificates/certificateRevocation.integration.test.ts` (list, PDF
  service, reactivation) and `app/api/certificates/[enrollmentId]/route.test.ts` (revoked + valid
  token → 404); `server/services/lesson/lesson.service.integration.test.ts` case — a progress sync on
  a cancelled enrollment leaves it cancelled and fires no certificate event.
- **Files:** `enrollment.repository.ts`, `certificate.service.ts`, `enrollment.service.ts`,
  `lesson.service.ts`, tests.
- **AC:** AC-C25, AC-F14 (certificate part).
- **Commit:** `feat(refund): revoked certificates are not served`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 6 — Closed conversations

- **Contract:** `messagingService.send` rejects a conversation with `closedAt` for both the student
  and the instructor (FORBIDDEN "This conversation is closed"); `getThread` still returns its history
  to both (C26, D1). Reactivating the enrollment reopens it (R5).
- **Test:** `server/services/messaging/messaging.service.integration.test.ts` — closed: send fails
  for both roles, thread readable by both; after reactivation send works.
- **Files:** `messaging.service.ts`, `enrollment.service.ts`, test.
- **AC:** AC-C26, AC-F14 (conversation part).
- **Commit:** `feat(refund): a closed conversation accepts no messages`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 7 — Refunded courses are never recommended back

- **Contract:** `recommendationsService.forUser` excludes every course the student has an
  enrollment for, cancelled included (REC).
- **Test:** `server/services/search/recommendations.service.integration.test.ts` (or the existing
  unit test) — a course with a cancelled enrollment is not returned.
- **Files:** `recommendations.service.ts`, `enrollment.repository.ts` (`findAnyEnrollmentCourseIds`), test.
- **AC:** AC-F14 (recommendations part).
- **Commit:** `feat(refund): never recommend a refunded course back`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 8 — A hidden review is restored on re-review

- **Contract:** `createReview` finds the student's soft-deleted review for the course and restores it
  with the new rating, comment and tags instead of failing on the unique key (E2-R).
- **Test:** `server/services/review/review.service.integration.test.ts` — soft-deleted review +
  completed repurchase → create restores one row with the new values; the rating counts it again.
- **Files:** `review.service.ts`, `courseReview.repository.ts`, test.
- **AC:** AC-F14 (review part), FR-P13.
- **Commit:** `feat(refund): restore a hidden review on re-review`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 9 — The effects function: once, in one transaction

- **Contract:** `refundEffectsService.apply({ paymentId, path, now }): Promise<boolean>` where
  `path` is `refund_request | dashboard_refund | admin_exception | lost_dispute`.
  In one transaction, only if `UPDATE payments SET status='refunded', refunded_at=now WHERE id=? AND
  status='succeeded'` changes the row (C8):
  - transfer `pending → cancelled` (CAS); `transferring` is left to the release (Task 13);
  - enrollment `cancelled` unless another `succeeded`, non-refunded payment for the course exists (DC);
  - `clearForRefund` (Task 3);
  - certificate revoked with the reason for `path` if `completedAt` is set (R4);
  - the student's conversation for the course closed; the review soft-deleted (R11);
  - a `processing` request on the payment set `refunded`.
  After commit: a `transferred` share is reversed (Task 2) unless `path = lost_dispute`; the interest
  profile is recomputed. Returns false (and does nothing) when the CAS loses.
- **Code included: the CAS gate on the money path** — the exact statement above is what is approved.
- **Test:** `server/services/refund/refundEffects.service.integration.test.ts` — every effect on a
  `pending` share; reversal on a `transferred` share; no reversal for `lost_dispute`; enrollment kept
  when another paid payment exists; two concurrent `apply` calls → effects once (one reversal, one
  archive add, counted) (AC-C8); a non-succeeded payment → false, nothing changes.
- **Files:** `server/services/refund/refundEffects.service.ts`, `server/repositories/refundEffects.repository.ts`, test.
- **AC:** AC-F14, AC-C8, FR-P6–P13.
- **Commit:** `feat(refund): one effects function behind a compare-and-set`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] Break it: drop the `status='succeeded'` guard, see the concurrency test go red, restore · [ ] typecheck + check · [ ] Commit

## Task 10 — Self-service refund: `refunds.create` after the request commits

- **Contract:** `refundService.executeRefund(requestId, now)`:
  live charge disputed → no Stripe refund, `refundError = "charge disputed"`, stays `processing` (R3,
  C12); else `refunds.list({ payment_intent })` finds a succeeded refund → use it; else
  `refunds.create({ payment_intent }, { idempotencyKey: refund:${paymentId} })` with nothing else (C2);
  Stripe `charge_already_refunded` counts as success (C3); on success `apply(path: refund_request)`;
  on any other error the request stays `processing` with `refundError` set. `requestRefund` calls it
  after its transaction commits for `auto_approved`; its result gains `refundStatus: "refunded" |
  "processing"` and never carries Stripe's message (FR-S20).
- **Test:** `server/services/refund/executeRefund.test.ts` (Stripe mocked) — create args exactly
  `{ payment_intent }` (AC-C2); existing refund → no create; `charge_already_refunded` → refunded
  (AC-C3); disputed → no create (AC-C12); Stripe error → processing, result has no Stripe text.
  `refund.service.integration.test.ts` — an approved request ends `refunded` with every effect
  applied (AC-F2 full); two concurrent requests → one `refunds.create` (AC-C3).
- **Files:** `refund.service.ts`, `server/repositories/refundRequest.repository.ts`, tests.
- **AC:** AC-F2, AC-C2, AC-C3, AC-C12 (Stripe call part), FR-S6, FR-S20 (server part).
- **Commit:** `feat(refund): refund an approved request at once through Stripe`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 11 — Stripe events through one handler; the webhook uses it

- **Contract:** `stripeEventService.handle(event)` owns the event switch. `charge.refunded` with the
  full amount refunded → `apply(path: dashboard_refund)` (no-op when Learnix already applied it, FR-P14);
  a partial refund → nothing (R2). `checkout.session.completed` and `account.updated` keep their
  behaviour. The route keeps signature checking and the dedup optimisation and delegates.
  `paymentService.handleRefund` is deleted.
- **Test:** `server/services/payments/stripeEvent.service.test.ts` — full vs partial; webhook route
  test updated to the delegation; integration: a Dashboard refund with the student flag off applies
  FR-P6–P13 (AC-F30, refund part).
- **Files:** `server/services/payments/stripeEvent.service.ts`, `app/api/stripe/webhook/route.ts`,
  `payment.service.ts`, tests.
- **AC:** AC-F14 (webhook path), AC-F30 (refund part), FR-P14.
- **Commit:** `feat(refund): Stripe events handled by one service`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 12 — The daily job retries processing refunds and replays missed events

- **Contract:** inside the run lock, before releasing, `payoutJobService.run`:
  1. retries up to 20 `processing` requests through `executeRefund` (R7);
  2. replays `charge.refunded` events created after the cursor (start: 30 days back, R6) through
     `stripeEventService.handle`, all pages, oldest first, then advances the cursor;
  3. releases payouts as before.
  The run record gains `refundsRetried`, `eventsReplayed`.
- **Test:** `server/services/payments/payoutJob.service.integration.test.ts` — a `charge.refunded`
  that never arrived is applied once by the replay (AC-F26); the same event through the webhook and
  the replay concurrently → effects once (AC-C8); a processing refund succeeds on retry; the cursor
  advances and a second run replays nothing new; a refund applied by the replay is not then released.
- **Files:** `payoutJob.service.ts`, `server/repositories/stripeReplayCursor.repository.ts`,
  `server/entities/payout/payout.dto.ts`, `payoutRun.repository.ts`, schema (`PayoutRun` counts) in
  Task 1, test.
- **AC:** AC-F26 (refund part), AC-C8, FR-P15, FR-S20 (retry).
- **Commit:** `feat(refund): daily job retries refunds and replays missed refund events`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 13 — A refund during a release ends in one reversal

- **Contract:** `releasePayment`, after creating or finding the transfer, re-reads the payment; if it
  is refunded, it reverses the transfer (Task 2) and reports `reversed_after_refund` instead of the
  slice-2 "needs a reversal" failure (C5 remainder).
- **Test:** `connect.service.test.ts` — refunded before the transfer was recorded → one reversal;
  `payoutHold.integration.test.ts` — a refund committed between claim and transfer ends with exactly
  one reversal (AC-C5).
- **Files:** `connect.service.ts`, `payout.dto.ts`, `payoutJob.service.ts` (counts), tests.
- **AC:** AC-C5 (third clause), AC-C7.
- **Commit:** `feat(refund): reverse a transfer made during a refund`

- [ ] Failing tests · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 14 — Account deletion removes the study archive

- **Contract:** `anonymiseAccount` deletes the student's `study_archive` rows (ADR-025).
- **Test:** `server/repositories/user.repository.integration.test.ts` — archive rows gone after
  anonymisation, another student's kept.
- **Files:** `user.repository.ts`, test.
- **AC:** FR-P9 ("deleted with the student's account").
- **Commit:** `feat(refund): account deletion removes the study archive`

- [ ] Failing test · [ ] FAIL · [ ] Implement · [ ] PASS · [ ] typecheck + check · [ ] Commit

## Task 15 — End to end: request → refunded → every effect

- **Contract:** real services, test DB, Stripe mocked: a student with progress, a quiz attempt, a
  tutor conversation, a concept check, a learning-path cache, a conversation and a held payment
  requests a refund inside the rules → Stripe refund created once; payment `refunded`; share
  `cancelled`; enrollment `cancelled`; records cleared, mastery kept, minutes archived; conversation
  closed; interest recomputed; the course no longer recommended; the payout job releases nothing for
  it; the late `charge.refunded` webhook changes nothing.
- **Test:** `server/services/refund/refundEndToEnd.integration.test.ts`.
- **AC:** AC-F2, AC-F14 (self-service path), FR-P14.
- **Commit:** `test(refund): a self-service refund applies every effect once`

- [ ] Write the test · [ ] PASS · [ ] Break it: make the webhook re-apply effects, see it go red, restore · [ ] Commit

## Task 16 — Record what the slice changed

- **Contract:** `ai-decision-log.md` gains R1–R11 and where the implementation differed from this
  plan; `security.md` slice-3 control status (C2, C3, C5, C7, C8, C12, C25, C26, AI-L13) and the
  slice-1 "access after approval" risk closed; ADR-037 amended only if R6/R7 change §4's replay
  shape; `spec.md` stays `in-progress`.
- **Commit:** `docs(refund): record slice-3 planning decisions`

- [ ] Write the entries · [ ] contract tests + `pnpm spec:sync` · [ ] Commit

---

## Why the plan is thin

A plan carrying full implementation code only pays for itself when a *cheaper* model executes it.
Here the executor is the same model that wrote the plan, so the feature gets generated twice — once
as code inside markdown, once as code — and the two drift. Contracts and test names are enough to
execute from, and the compiler and the tests catch what prose cannot. — ADR-030.

**The exception, and it is narrow:** include code when the exact form of the code *is* the thing
being approved. Here: the refund-state backfill (Task 1) and the effects CAS gate (Task 9).

## Self-review

**Spec coverage — in this slice:**

| AC | Task | Covered |
|---|---|---|
| AC-F2 | 10, 15 | Full: refunded at once |
| AC-F14 | 3, 5–9, 11, 15 | Self-service, Dashboard webhook and replay paths. Appeal, exception, lost dispute → slices 8, 4 (same `apply`) |
| AC-F23 | 10 | Server part: no Stripe text reaches the student. Page text → slice 7; day-3 emails → FR-A11 |
| AC-F26 | 12 | `charge.refunded`. Dispute-closed → slice 4 |
| AC-F29 | 3, 4 | Full |
| AC-F30 | 11 | Refund part (Dashboard refund with the flag off). Dispute and job-email parts → slices 4, 5 |
| AC-C2 | 10 | Full |
| AC-C3 | 10 | Full |
| AC-C5 | 13 | Third clause (one reversal) |
| AC-C7 | 2, 10, 13 | Refunds and reversals (transfers in slice 2) |
| AC-C8 | 9, 12 | Full |
| AC-C12 | 10 | No `refunds.create` on a disputed charge. Stored state and display → slice 4 |
| AC-C25 | 5 | Full |
| AC-C26 | 6 | Full |
| AC-L13 | 3 | Concept checks and learning-path cache deleted |

**Deferred — not in this slice:** AC-F10 (exception), AC-F15 (partial), AC-F16/C13 (double charge),
AC-F17 (bank failure), AC-F22 (lost dispute), UI ACs, FR-A11 emails.

**Guarded coverage:** C2, C3, C12 → Task 10; C5 → Task 13; C7 → Tasks 2, 10, 13; C8 → Tasks 9, 12
(break-it in 9); C25 → Task 5; C26 → Task 6; AI-L13 → Task 3. Each has its own test.

**Contract clarity / type consistency:** `refundEffectsService.apply` (Task 9) is called by Tasks
10, 11, 12; `RefundEffectPath` lives in `server/entities/refund/refund.dto.ts`; `reverseTransfer`
(Task 2) is used by Tasks 9 and 13; `clearForRefund` (Task 3) by Task 9; `executeRefund` (Task 10)
by Task 12; `stripeEventService.handle` (Task 11) by Task 12 and the webhook.

## Final verification

- `pnpm typecheck`, `pnpm check`, `pnpm test:unit`, `pnpm test:integration` — all green.
- Break-it checks: Task 9 (CAS guard), Task 15 (webhook re-applies).
- Manual, local DB, Stripe test mode, flag on: buy a course, open 2 lessons, request a refund from
  the console → `refundStatus: "refunded"`; the Stripe dashboard shows one refund; the course is gone
  from the dashboard, its certificate list entry (if any) gone, the conversation read-only; the
  progress page shows the same minutes and streak as before. Refund another purchase from the Stripe
  Dashboard → the same effects within seconds (webhook).
- Before deploy: migrations applied in every environment; register `charge.refunded` on the Stripe
  webhook endpoint if it is not already.
