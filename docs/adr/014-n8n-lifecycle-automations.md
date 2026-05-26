# ADR-014: n8n Lifecycle Automations

## Status
Accepted — 2026-05-17

## Context
Learnix has rich lifecycle signals (`LessonProgress`, `Enrollment.completedAt`) but no outbound communication. Baking email automations into Next.js couples operational/marketing changes to code deploys.

## Decision
Three lifecycle email automations (certificate earned, inactivity nudge, near-completion nudge) are orchestrated by a self-hosted n8n instance:

- **Outbound webhooks** (Learnix → n8n): HMAC-SHA256 signed (`X-Learnix-Signature: sha256=<hex>`), at-least-once with 3 exponential-backoff retries. Fired by `NotificationEmitter` from `LessonService.markLessonComplete` and `EnrollmentService`.
- **Inbound REST API** (n8n → Learnix): Bearer-token authenticated (`Authorization: Bearer <N8N_API_TOKEN>`). `GET /api/notifications/inactive-students` feeds the daily cron; `POST /api/notifications/log` + `DELETE` manage idempotency at the n8n level.
- **Email delivery**: n8n calls `POST /api/emails/send`, which delegates to Learnix's existing `emailService` (Resend + React Email). n8n does not call Resend directly — this keeps email template logic server-side and reuses the existing opt-out check.
- **Idempotency**: `NotificationLog.dedupKey` unique constraint is the single source of truth. n8n logs before sending and rolls back (DELETE) if the send fails.
- **Certificate PDF**: `@react-pdf/renderer` renders on demand in `app/api/certificates/[enrollmentId]`, returned as `application/pdf`. Auth via short-lived JWT (30d) signed with `N8N_API_TOKEN`. No PDF caching in v1.
- **Opt-out**: `User.emailNotificationsEnabled` (default `true`). Public `/unsubscribe?token=` page flips it to `false`; every n8n workflow gates on the flag before logging or sending. The unsubscribe token is a non-expiring JWT signed with `N8N_API_TOKEN`.
- **Progress tracking**: `LessonService.syncProgressAndFireEvents` (fire-and-forget) updates `enrollment.progress` and fires webhook events after each lesson completion.
- **Hosting**: self-hosted n8n on any VPS via `docker-compose.n8n.prod.yml` (n8n + Postgres). Workflow JSONs live in `n8n/workflows/`, deployed with `pnpm sync:n8n`.

## Consequences
- Non-engineers can tweak automation logic in the n8n UI without a code deploy.
- New notification channels (Slack, SMS) are "add a node," not a rewrite.
- `enrollment.progress` is now kept accurate on every lesson completion.
- n8n is an operational dependency; n8n downtime delays (but does not lose) event-driven notifications, as Learnix retries 3×. The inactivity cron will simply not run while n8n is down.
- Certificate PDFs are generated on demand — no storage cost, but latency scales with PDF complexity.