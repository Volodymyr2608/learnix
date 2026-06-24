# Requirements: In-platform certificates & direct (n8n-free) lifecycle emails

> Design in [`spec.md`](./spec.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Status: planned

- Date: 2026-06-22
- Author: Volodymyr Pelykh
- Stakeholders consulted: Volodymyr (product owner)

## Problem

Two related gaps, both caused by the project depending on a self-hosted n8n instance that has been
shut down:

1. **Certificates are only reachable by email.** A completed-course certificate can be downloaded
   *only* via a signed link inside the `course.certificate` email
   (`server/services/notifications/notification.service.ts:51`). The PDF route itself already works
   (`app/api/certificates/[enrollmentId]/route.ts`), but there is no place inside the platform for a
   logged-in student to find and download their certificate. If the email never arrives or is lost,
   the certificate is effectively inaccessible.

2. **The two completion-driven emails no longer send.** `certificate.earned` and
   `progress.near_completion` are emitted to n8n via an outbound webhook
   (`server/services/notifications/notificationEmitter.ts:41` →
   `${N8N_WEBHOOK_BASE_URL}/${type}`). n8n was the orchestrator that called back into the app's own
   Resend-based `emailService` (`app/api/emails/send/route.ts`). With the n8n server stopped, the
   webhook POST fails on every retry and **no certificate or near-completion email is sent**, even
   though the app already contains the full email-sending machinery (Resend + rendered React
   templates `course.certificate` and `engagement.near-completion`).

The email-sending capability already lives in-app; n8n was only a now-dead middleman for these two
events.

## Goal

- A logged-in student can find and download the certificate for any course they have completed,
  directly inside the platform, without relying on email.
- The "course completed / certificate earned" email is sent reliably again, in-process, without n8n.
- The "near completion" nudge email is sent reliably again, in-process, without n8n, and at most
  once per enrollment.
- No regression to the existing emailed certificate link or to the still-scheduled inactivity email.

## Scope decisions (locked)

1. **Certificate access surface = a dedicated "My Certificates" dashboard page** — a single,
   discoverable place listing all completed courses with download buttons; rules out scattering
   download buttons across course cards for this iteration.
2. **Email de-n8n-ing covers only the two event-driven emails** (`certificate.earned`,
   `progress.near_completion`) — the scheduled `inactivity-7d` email stays on n8n and is out of
   scope, because it needs a separate scheduler/cron replacement.
3. **Near-completion email is deduplicated to at most once per enrollment** — progress updates that
   keep the student near the threshold must not re-trigger the email.
4. **Reuse the existing PDF download route unchanged** — the new page authorises downloads by
   minting the existing signed certificate token server-side, rather than adding a new auth path to
   the `/api/certificates/[enrollmentId]` route.
5. **Reuse the existing Resend `emailService` and email templates** — no new email infrastructure,
   no template changes beyond what the existing payloads already require.

## Assumptions & constraints

- The PDF rendering path (`certificateService.renderPdf`) and the certificate token signing/verify
  helpers (`signCertificateToken` / `verifyCertificateToken`) are correct and stay as-is.
- A certificate exists conceptually for an enrollment **iff** that enrollment has a non-null
  `completedAt`; there is no separate certificate record.
- `emailService.send` already enforces opt-out (`emailNotificationsEnabled`) for STANDARD emails, so
  opt-out handling does not need to be re-implemented.
- The `notificationLog` table + `notificationLogRepository.tryLog` (unique `dedupKey`) is the
  established dedup mechanism and is reused for near-completion (and certificate) dedup.
- The n8n **inbound** routes (`/api/emails/send`, `/api/notifications/*`) and `N8N_API_TOKEN` remain
  in place for the out-of-scope inactivity job; only the outbound emitter usage for the two events is
  removed.
- Email sending stays fire-and-forget from the lesson-completion flow (failures logged, never block
  the student's progress write), matching the current pattern in
  `server/services/lesson/lesson.service.ts:211`.

## Functional requirements

### My Certificates page

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR1 | `/dashboard/certificates` | Given a signed-in student, when they open the page, then they see one entry for each course they have completed (enrollment with a non-null `completedAt`), showing course title, instructor name, and completion date. |
| FR2 | `/dashboard/certificates` | Given a student who has completed no courses, when they open the page, then they see an empty state explaining that certificates appear here after completing a course (no error). |
| FR3 | `/dashboard/certificates` | Given a completed-course entry, when the student clicks **Download**, then the certificate PDF for that enrollment downloads (`Content-Type: application/pdf`, attachment). |
| FR4 | Dashboard navigation | Given a signed-in student, the dashboard navigation exposes a link to the My Certificates page. |
| FR5 | Download authorisation | Given the page renders a download link, the link authorises via a freshly signed certificate token for that enrollment; a student is only offered download links for their own completed enrollments. |
| FR6 | Download authorisation | Given a request to the certificate PDF route for an enrollment that is not completed, when processed, then it responds 409 (not completed) and no PDF is produced (unchanged route behaviour). |

### Direct certificate-earned email

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR7 | Course completion | Given a student completes the final lesson of a course, when the completion is recorded, then a `course.certificate` email is sent in-process via Resend (no n8n webhook call), containing the student name, course title, instructor name, the signed certificate-download link, and an unsubscribe link. |
| FR8 | Course completion | Given the student has disabled email notifications, when course completion fires the certificate email, then no email is sent (opt-out honoured) and the completion still succeeds. |
| FR9 | Course completion | Given the certificate email has already been sent for an enrollment, when the certificate flow fires again for the same enrollment, then no duplicate email is sent. |
| FR10 | Course completion | Given Resend or rendering fails, when the certificate email send throws, then the failure is logged and the student's lesson-completion request still succeeds. |

### Direct near-completion email

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR11 | Lesson progress | Given a student crosses the near-completion threshold in a course, when progress is recorded, then an `engagement.near-completion` email is sent in-process via Resend (no n8n webhook call), containing student name, course title, lessons remaining, the next-lesson link, and an unsubscribe link. |
| FR12 | Lesson progress | Given the near-completion email has already been sent for an enrollment, when subsequent progress updates keep the student near the threshold, then no further near-completion email is sent (at most once per enrollment). |
| FR13 | Lesson progress | Given the student has disabled email notifications, when the near-completion threshold is crossed, then no email is sent (opt-out honoured) and the progress write still succeeds. |
| FR14 | Lesson progress | Given Resend or rendering fails, when the near-completion email send throws, then the failure is logged and the student's progress request still succeeds. |

### Cleanup / non-regression

| # | Surface | Behaviour (acceptance criteria) |
|---|---------|---------------------------------|
| FR15 | Notification emitter | Given the two event-driven emails now send directly, the outbound n8n emitter (`notificationEmitter`) is no longer invoked for `certificate.earned` or `progress.near_completion`. |
| FR16 | n8n inbound routes | Given the change ships, the inbound routes `/api/emails/send`, `/api/notifications/inactive-students`, and `/api/notifications/log` continue to function unchanged for the out-of-scope inactivity job. |
| FR17 | Emailed link | Given the existing emailed certificate link format, when a recipient opens it, then the certificate still downloads (the signed-token download contract is preserved). |

## Out of scope

- Replacing the scheduled **inactivity-7d** email (still driven by n8n cron); needs a separate
  in-app scheduler decision.
- Any certificate **design/visual** changes to the PDF itself.
- A public/shareable certificate verification page or LinkedIn "add to profile" integration.
- Per-course toggle for whether a certificate is issued (all completed courses yield a certificate).
- Removing n8n env vars or fully decommissioning n8n.