# Validation: In-platform certificates & direct (n8n-free) lifecycle emails

> Requirements in [`requirements.md`](./requirements.md) · design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md)

## Automated checks

- `pnpm typecheck` — clean.
- `pnpm check` — Biome lint + format clean.
- `pnpm test:unit` — green (includes the new `certificate.service` and `notification.service` suites).
- `pnpm test:integration` — green (no integration tests added; must not regress).

### Unit tests (`*.test.ts` — no DB, external deps mocked)

- `certificateService.listEarned`: given repo rows with a non-null `completedAt`, returns mapped `EarnedCertificate[]` (`enrollmentId`, `courseId`, `courseTitle`, `instructorName`, `completedAt`); given no rows, returns `[]`.
- `notificationService.fireCertificateEarned`:
  - `tryLog` returns `{created:true}` → calls `emailService.send` once with `templateKey: "course.certificate"`, correct `toEmail`/`userId`, payload containing `studentName`/`courseTitle`/`instructorName`, and `certificatePdfUrl` containing the signed token.
  - `tryLog` returns `{created:false}` → `emailService.send` not called.
  - enrollment missing → returns silently, neither `tryLog` nor `send` called.
- `notificationService.fireProgressNearCompletion`:
  - `tryLog` returns `{created:true}` → calls `emailService.send` once with `templateKey: "engagement.near-completion"`, payload containing `studentName`/`courseTitle`/`lessonsRemaining` and a `nextLessonUrl` referencing the next lesson id.
  - `tryLog` returns `{created:false}` → `emailService.send` not called.

### Integration tests (`*.integration.test.ts` — `learnix_test`)

None added. The dedup mechanism (`notificationLogRepository.tryLog` unique-constraint behaviour) is already covered by the existing notification-log integration coverage; this feature only adds new `dedupKey`/`automation` string values, which need no new schema-level test.

## Traceability (every requirement is covered)

| Requirement | Covered by |
|-------------|-----------|
| FR1 (lists completed courses) | `certificateService.listEarned` unit test; Manual #1 |
| FR2 (empty state) | Manual #2 |
| FR3 (download PDF) | Manual #1 (download click → PDF) |
| FR4 (nav link) | Manual #1 (navigate via sidebar) |
| FR5 (server-minted token, own enrollments only) | `findCompletedByStudent` filters by `studentId` (unit mapping test); Manual #5 (IDOR) |
| FR6 (409 on not-completed) | Manual #6 |
| FR7 (certificate email sent in-process) | `fireCertificateEarned` unit test (send called, template key); Manual #3 |
| FR8 (opt-out honoured) | Manual #4 (notifications disabled → no email; completion still succeeds) |
| FR9 (no duplicate certificate email) | `fireCertificateEarned` unit test (`created:false` → no send); Manual #3 step 2 |
| FR10 (send failure non-blocking) | Existing `.catch(logger.warn)` in `lesson.service.ts` (unchanged); Edge case below |
| FR11 (near-completion email sent in-process) | `fireProgressNearCompletion` unit test; Manual #7 |
| FR12 (near-completion at most once) | `fireProgressNearCompletion` unit test (`created:false` → no send); Manual #7 step 3 |
| FR13 (opt-out honoured) | Manual #4 (same mechanism — `emailService` STANDARD opt-out) |
| FR14 (send failure non-blocking) | Existing `.catch(logger.warn)` in `lesson.service.ts`; Edge case below |
| FR15 (emitter no longer invoked) | Task 6 grep gate (no `notificationEmitter` references); `pnpm typecheck` |
| FR16 (inbound n8n routes untouched) | No diff to `app/api/notifications/*` or `app/api/emails/send`; Manual #8 |
| FR17 (emailed link still works) | Same URL format produced in `fireCertificateEarned`; Manual #3 step 3 |

## Manual test scenarios

Prereqs:
```bash
docker-compose up -d          # local Postgres on 5433
pnpm dev                      # dev server
# Real Resend send requires RESEND_API_KEY + EMAIL_FROM_ADDRESS set in .env.
# Seed: at least one student account with one COMPLETED enrollment and one
# in-progress enrollment, plus one course with exactly 1-2 lessons remaining
# for the near-completion path.
```

1. **My Certificates — populated:** Sign in as a student with a completed course → click **Certificates** in the sidebar → page lists the completed course with title, instructor, and completion date → click **Download** → a `*-certificate.pdf` downloads and opens to a valid certificate.
2. **My Certificates — empty:** Sign in as a student with no completed courses → open `/dashboard/certificates` → the empty state ("No certificates yet") shows, no error.
3. **Certificate email direct + dedup + emailed link:**
   1. As a student, complete the final remaining lesson of a course → within seconds a "You completed …" email arrives (Resend), with a working download link.
   2. Re-trigger completion for the same enrollment (e.g. mark a lesson incomplete then complete again) → **no second email** is sent (dedup).
   3. Open the certificate link from the received email → the PDF downloads (FR17).
4. **Opt-out:** In account settings, disable email notifications → complete a course → **no certificate email** is sent, but the course still shows as completed and the certificate is available on the My Certificates page.
5. **IDOR:** As student A, note a completed `enrollmentId` belonging to student B (from DB). Confirm the My Certificates page for A never lists B's enrollment, and A is never given a download link for B's enrollment. (The PDF route still enforces its own signed-token check.)
6. **Not-completed download:** Manually request `/api/certificates/<an-in-progress-enrollmentId>?token=<valid token for it>` → responds `409` "Course not completed"; no PDF.
7. **Near-completion email + dedup:**
   1. As a student, complete lessons until exactly 1-2 remain → a "lessons left" email arrives.
   2. Complete another lesson keeping ≥1 remaining (still in the 1-2 window) → **no second** near-completion email.
   3. Confirm a `notificationLog` row exists with `automation = "near_completion"` for that student+course.
8. **Inbound n8n routes unaffected:** With a valid bearer token, `POST /api/emails/send` and `GET /api/notifications/inactive-students` still respond as before (the inactivity automation path is untouched).

## Edge cases & regression

- **Send failure is non-blocking (FR10/FR14):** if Resend errors, the `emailService.send` throw is caught by the existing `.catch(logger.warn)` in `server/services/lesson/lesson.service.ts`; the student's lesson-completion / progress write still succeeds. Verify by temporarily using an invalid `RESEND_API_KEY` → completing a course → progress updates, an error is logged, no crash. (Accepted risk per spec: the `notificationLog` row is already written, so the email won't auto-retry; the certificate remains downloadable on the page.)
- **Dedup race:** two concurrent completion events for the same enrollment → `tryLog` unique constraint guarantees only one `{created:true}`, so at most one email.
- **Course with zero lessons:** `lesson.service` already returns early when `totalLessons === 0`; no `fire*` call, no email.
- **Token tampering:** the PDF route rejects tampered/expired tokens with `401` (existing `certificateToken.test.ts` behaviour, unchanged).
- **Regression — dead-code removal:** after deleting `notificationEmitter` and `signHmac`/`verifyHmac`, `pnpm typecheck` and `pnpm check` confirm no dangling imports; `requireBearer` (still used by inbound routes) is untouched.

## Definition of done

- [ ] All automated checks green; new code covered by the unit tests above.
- [ ] Every FR in `requirements.md` traces to a passing check (table above).
- [ ] All manual scenarios pass.
- [ ] Risks in `spec.md` mitigated or explicitly accepted (failed-send-after-log accepted; emitter-removal grep-gated).
- [ ] Docs updated where warranted: CLAUDE.md notification section reflects that `certificate.earned` / `progress.near_completion` now send in-process (n8n only drives the inactivity job).