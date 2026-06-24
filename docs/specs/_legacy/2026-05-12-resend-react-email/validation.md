# Validation: Resend + React Email

## Automated checks

| Command | Expectation |
|---|---|
| `pnpm typecheck` | No errors. Template registry is `satisfies`-typed; broken payloads fail at compile time. |
| `pnpm check` | No lint or format issues. |
| `pnpm build` | Production build succeeds; React Email templates compile. |
| `pnpm db:generate` | `welcomeEmailSentAt` migration applies cleanly. Re-running is a no-op. |
| `pnpm email:dev` | `react-email` dev server starts on port 3001; all 7 templates render with their `PreviewProps`. |

## Manual scenarios

Run `pnpm dev`. Set local env:

```
RESEND_API_KEY=re_test_...           # Resend's test key — accepted but not delivered
EMAIL_FROM_ADDRESS=hello@dev.local
N8N_API_TOKEN=$(openssl rand -hex 16)
BASE_URL=http://localhost:3000
```

Seed: a STUDENT and an INSTRUCTOR with valid emails, one published course.

### S1 — Verify-email end-to-end (Better Auth)

1. From the sign-up form, register a new user.
2. **Verify** the Better Auth response is success (no thrown error).
3. **Verify** the Resend test dashboard shows the send for `templateKey: "auth.verify-email"`.
4. **Verify** `pnpm email:dev` preview renders the same component the email used (matching subject).

### S2 — Password reset

1. Hit the "forgot password" form.
2. **Verify** the Resend test dashboard shows an `auth.password-reset` send.
3. **Verify** the link in the email payload is a valid reset URL.

### S3 — Critical templates bypass opt-out

1. Set `User.emailNotificationsEnabled = false` for a test user.
2. Trigger a password reset for that user.
3. **Verify** the Resend dashboard shows the send (CRITICAL templates ignore opt-out).
4. POST `/api/emails/send` with `templateKey: "enrollment.confirmed"` for the same user.
5. **Verify** response is `{ skipped: "opted_out" }`; no Resend send.

### S4 — Welcome email fires once

1. Sign up and verify a new user; visit `/dashboard`.
2. **Verify** the Resend dashboard shows a `user.welcome` send.
3. **Verify** `User.welcomeEmailSentAt` is now set in the DB.
4. Reload `/dashboard`.
5. **Verify** no second `user.welcome` send.

### S5 — Enrollment confirmation

1. Enrol the test student in the seeded course via the existing enrol flow.
2. **Verify** an `enrollment.confirmed` send shows in the Resend dashboard.
3. **Verify** the enrol response is success regardless of email delivery (fire-and-forget).

### S6 — Resend failure does not break enrolment

1. Temporarily set `RESEND_API_KEY` to an obviously invalid string.
2. Enrol the test student.
3. **Verify** enrolment still succeeds (DB row created).
4. **Verify** `console.error("enrollment email failed", ...)` in the dev server logs.
5. Restore the key.

### S7 — `POST /api/emails/send` happy path

```bash
curl -X POST http://localhost:3000/api/emails/send \
  -H "Authorization: Bearer $N8N_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateKey": "course.certificate",
    "toEmail": "student@example.com",
    "userId": "<seeded studentId>",
    "payload": {
      "studentName": "Test Student",
      "courseTitle": "Seeded Course",
      "instructorName": "Test Instructor",
      "certificatePdfUrl": "https://learnix.app/api/certificates/enr_test1?token=demo",
      "unsubscribeUrl": "https://learnix.app/unsubscribe?token=demo"
    }
  }'
```

1. **Verify** response `{ id: "re_..." }` (200).
2. **Verify** the Resend dashboard shows the send.

### S8 — `POST /api/emails/send` auth

1. POST with `Authorization: Bearer wrong`.
2. **Verify** 401.
3. POST with no `Authorization` header.
4. **Verify** 401.

### S9 — `POST /api/emails/send` validation

1. POST with `templateKey: "nope.nope"`.
2. **Verify** 400, response `{ error: "unknown_template" }`.
3. POST with valid `templateKey` but `payload: { studentName: 123 }`.
4. **Verify** 422, response `{ error: "invalid_payload", issues: [...] }`.

### S10 — `POST /api/emails/send` Resend failure surfaces as 502

1. Set `RESEND_API_KEY` to an invalid value.
2. POST `/api/emails/send` with a valid `course.certificate` body.
3. **Verify** response `{ error: "resend_failed", detail: "..." }` (502).
4. Restore the key. Repeat the POST.
5. **Verify** response `{ id: "re_..." }` (200).

### S11 — n8n workflow uses new endpoint (lifecycle smoke)

Pre-req: ADR-014 / Phase 12 n8n workflows already imported, then updated per Step 10 of `plan.md`.

1. Run `pnpm dev:n8n`. Open n8n UI.
2. Manually execute the `certificate` workflow with a synthetic webhook body referencing the seeded enrolment.
3. **Verify** in n8n execution log: a single `HTTP Request` node calls `http://host.docker.internal:3000/api/emails/send`, returns 200 with `{ id: "..." }`.
4. **Verify** the Resend dashboard shows a `course.certificate` send.

### S12 — n8n HTTP-node retry on transient failure

1. With Phase 12 n8n running, temporarily set `RESEND_API_KEY` to invalid.
2. Manually execute the `certificate` workflow.
3. **Verify** in n8n execution log: the HTTP node retried 3 times (per its configured policy), then surfaced the failure. `NotificationLog` (ADR-014) row was rolled back via the workflow's existing error branch.
4. Restore the key. Re-execute.
5. **Verify** the send succeeds and `NotificationLog` row is in place.

### S13 — Plain-text fallback present

1. Send any email via `S7`.
2. In the Resend dashboard, open the message detail.
3. **Verify** both `html` and `text` parts are present.

### S14 — `pnpm email:dev` preview parity

1. Run `pnpm email:dev`.
2. For each of the 7 templates, open the preview in the browser.
3. **Verify** the layout matches the email rendered in `S1`–`S5` (logo, footer, button, copy).

### S15 — Production smoke test

After deploy:

1. From production, sign up a new test user.
2. **Verify** verify-email arrives in the test inbox within a few seconds.
3. Click the verify link. Then trigger a password reset; **verify** that email arrives.
4. Visit `/dashboard`; **verify** the welcome email arrives.
5. Enrol the test user in a course; **verify** the enrolment email arrives.
6. (Phase 12 must be deployed for this:) complete the course end-to-end. **Verify** the certificate email arrives.