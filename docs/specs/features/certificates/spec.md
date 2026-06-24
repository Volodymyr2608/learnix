---
feature: certificates
status: stable
models: [NotificationLog]
depends-on: [enrollment]
---

## Purpose

Students who complete a course want proof of completion they can download or share, and should be
notified at completion and as they near it — without depending on the n8n outbound pipeline for either.

## Functional scope

- `certificate.listEarned` (studentProcedure) returns the caller's completed enrollments
  (`completedAt != null`). `/dashboard/certificates` (RSC) renders them and mints a fresh
  `signCertificateToken` per row server-side — the token is never exposed through the tRPC
  query/client cache.
- Download link points at the existing `GET /api/certificates/[enrollmentId]?token=…` route,
  unchanged: 200 PDF / 401 bad token / 409 not completed.
- `certificate.earned` and `progress.near_completion` emails send **in-process** via the Resend
  `emailService`, not through n8n. `notificationService.fireCertificateEarned` /
  `fireProgressNearCompletion` call `notificationLogRepository.tryLog({dedupKey, automation})` first —
  `created === false` means already sent, so the send is skipped (at-most-once per enrollment).
- Both fire fire-and-forget from `lesson.service.ts` (`.catch(logger.warn)`) — a send failure never
  blocks the student's progress write.
- n8n's inbound routes (`/api/emails/send`, `/api/notifications/*`) remain only for the still-scheduled
  inactivity-7d email; the outbound n8n emitter these two events used to go through has been deleted.

## Acceptance criteria

- A student who completes a course can always find and download their certificate from
  `/dashboard/certificates`, even if the completion email failed to send.
- A given enrollment never receives the same certificate-earned or near-completion email twice, even
  under concurrent progress-write retries.
- A failed email send never prevents or delays the underlying lesson-progress write.

## Agent notes

- Dedup key shape: `"<studentId>:certificate:<courseId>"` / `"<studentId>:near_completion:<courseId>"`,
  no date component — these are once-per-enrollment-ever, not once-per-day.
- `tryLog` is called **before** sending; if the send then throws, the log row already exists and the
  send is not retried automatically. Acceptable because the certificate also lives on the My
  Certificates page and near-completion is best-effort, not guaranteed delivery.
- Token minting (`signCertificateToken`) must stay server-side only — never return a token through a
  tRPC response.