# Validation: n8n Lifecycle Automations

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. |
| `pnpm check` | No lint or format issues. |
| `pnpm build` | Production build succeeds. |
| `pnpm db:generate` | Migration applies cleanly. |
| `pnpm sync:n8n` (against local n8n) | All 6 workflow JSONs upload without errors. |

## Manual scenarios

Run `pnpm dev` and `pnpm dev:n8n`. Set local env: `N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook`, `RESEND_API_KEY=re_test_...` (Resend test key). In n8n UI, activate all three workflows.

Seed: STUDENT enrolled in a published course with multiple lessons. INSTRUCTOR account with `name` populated. `User.email` valid.

### S1 — Certificate end-to-end

1. As STUDENT, mark every lesson in the course complete, finishing with the last one.
2. **Verify** in server log: `notificationEmitter.emit certificate.earned` with `status: sent`.
3. **Verify** in n8n execution log: `certificate` workflow ran, all nodes green, ended with a Resend call.
4. **Verify** in Resend dashboard (test mode): an email was accepted with the subject `🎓 You completed <course title>`.
5. **Verify** the email has a PDF attachment named `<course slug>-certificate.pdf` of non-zero bytes.
6. Open the PDF: student name, course title, instructor name, completion date all render correctly.
7. **Verify** `notification_logs` has a row with `dedupKey = ${userId}:certificate:${enrollmentId}`.

### S2 — Certificate idempotency

1. From S1, manually re-fire the event: `pnpm tsx scripts/fire-test-event.ts certificate.earned <enrollmentId>`.
2. **Verify** the workflow short-circuits at the log node — no new Resend call.
3. **Verify** `notification_logs` still has exactly one row for this enrollment.

### S3 — Near-completion email

1. Reset student progress, then mark all-but-2 lessons complete. The last one of those triggers `progress.near_completion`.
2. **Verify** in n8n execution log: workflow ran, ended with a Resend call. Subject mentions "2 lessons left".
3. Mark one more lesson complete (`lessonsRemaining = 1`).
4. **Verify**: no new email. `notification_logs` still has only the original `near_completion` row for this (user, course).

### S4 — Inactivity dry-run

1. Hit `GET /api/notifications/inactive-students?inactiveDays=7&minProgressPct=10&maxProgressPct=99&dryRun=true` with the Bearer token.
2. **Verify** the response is a list of candidates with pre-computed `dedupKey` strings.
3. **Verify** no `notification_logs` rows are written.

### S5 — Inactivity workflow live

1. Backdate one `LessonProgress.updatedAt` to 10 days ago for a mid-course student.
2. In n8n, manually execute the `inactivity` workflow.
3. **Verify** the candidate appears, the log POST returns `created: true`, the Resend send fires.
4. Re-execute the same workflow within the same UTC calendar day.
5. **Verify** the second run short-circuits at the log node — no second email.

### S6 — Opt-out

1. As STUDENT, hit `/unsubscribe?token=<valid token>`.
2. **Verify** the success page shows; `User.emailNotificationsEnabled` is now `false`.
3. Re-trigger the certificate event (S1's last action).
4. **Verify** in n8n: the workflow exits at the `emailNotificationsEnabled == true` IF-node. No Resend call.
5. **Verify** no `notification_logs` row is written (or, if written by the workflow's order, no email is sent — design choice; gate must be before the log call to avoid writing).

### S7 — HMAC verification rejects bad signature

1. Manually POST `http://localhost:5678/webhook/certificate.earned` with a valid body and `X-Learnix-Signature: sha256=deadbeef`.
2. **Verify** n8n returns 401 (or workflow throws and execution shows failed).
3. **Verify** no log row, no email.

### S8 — Bearer auth rejects bad token

1. Manually GET `http://localhost:3000/api/notifications/inactive-students` with `Authorization: Bearer wrong`.
2. **Verify** 401 response.
3. POST `/api/notifications/log` without auth → 401.

### S9 — Certificate PDF auth

1. GET `/api/certificates/<enrollmentId>` **without** `?token=`.
2. **Verify** 401.
3. GET with `?token=<garbage>`.
4. **Verify** 401.
5. GET with a valid token for a different enrollment's ID.
6. **Verify** 401 (token's `enrollmentId` claim doesn't match path param).
7. GET with valid token but `enrollment.completedAt = null`.
8. **Verify** 409.

### S10 — Resend failure rolls back log row

1. Temporarily set `RESEND_API_KEY` to an obviously invalid value.
2. Trigger a certificate event.
3. **Verify** in n8n: log POST returned `created: true`; Resend call failed; `DELETE /api/notifications/log` was called on the error branch.
4. **Verify** `notification_logs` has no row for this enrollment.
5. Restore the key, re-fire the event.
6. **Verify** the email is delivered this time and the log row is created.

### S11 — Retry on webhook delivery

1. Stop the n8n container.
2. Trigger a certificate event.
3. **Verify** in server log: 3 retry attempts (1s, 5s, 25s) logged, all failed; final `status: failed` for the `eventId`.
4. Restart n8n.
5. Re-fire via `fire-test-event.ts certificate.earned`.
6. **Verify** the workflow runs and the email is delivered.

### S12 — Inbound API on production endpoints

1. Deploy to a staging environment (or simulate via tunnel).
2. From the deployed n8n instance, configure the HTTP nodes to point at the staging Learnix URL.
3. Manually execute the inactivity workflow.
4. **Verify** the inbound calls reach Learnix, return 200, and emails fire.

### S13 — Unsubscribe page error handling

1. Hit `/unsubscribe` with no `token`.
2. **Verify** an error UI is shown ("Invalid or expired link"), `User.emailNotificationsEnabled` unchanged.
3. Hit `/unsubscribe?token=garbage`.
4. **Verify** the same error UI.

### S14 — `User.emailNotificationsEnabled` migration backfill

1. Apply the migration on a non-empty database.
2. **Verify** every existing user row has `emailNotificationsEnabled = true` (default).
3. **Verify** no migration error or downtime.

### S15 — End-to-end production smoke test

After production rollout:

1. As a test STUDENT, complete a short test course end-to-end.
2. **Verify** within ~30 seconds, the certificate email lands in the inbox.
3. Click the certificate attachment — opens a valid PDF.
4. Click the unsubscribe link — page confirms; `User.emailNotificationsEnabled = false` in production DB.
5. Re-enable manually for the test account and reset for the next smoke test.