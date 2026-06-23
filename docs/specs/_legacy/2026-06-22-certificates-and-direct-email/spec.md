# Spec: In-platform certificates & direct (n8n-free) lifecycle emails

> Requirements in [`requirements.md`](./requirements.md) · plan in [`plan.md`](./plan.md) · checks in [`validation.md`](./validation.md)

## Approach (overview)

Two independent slices, sharing no new persistence beyond the existing `notificationLog` table.

**Certificates page:** a new student-only tRPC query `certificate.listEarned` returns the student's
completed enrollments. A new RSC page `/dashboard/certificates` renders them, and — for each entry —
mints the existing signed certificate token (`signCertificateToken`) server-side and embeds it in a
download link to the **unchanged** `GET /api/certificates/[enrollmentId]?token=…` route. This reuses
the proven PDF + token-verification path verbatim (scope decision #4); the alternative — adding a
second, session-based auth branch to the PDF route — was rejected to avoid two authz paths on one
route.

**Direct emails:** the bodies of `notificationService.fireCertificateEarned` and
`fireProgressNearCompletion` are rewritten to call the in-app Resend `emailService.send(...)`
directly instead of `notificationEmitter.emit(...)`. Dedup uses `notificationLogRepository.tryLog`
with a per-enrollment `dedupKey` so each email fires at most once per enrollment (scope decision #3).
The lesson-completion flow (`lesson.service.ts`) is unchanged — it already calls these two methods
fire-and-forget. The outbound `notificationEmitter` becomes unused and is deleted.

## Architectural decisions referenced

- **Three-layer pattern (routers → services → repositories)** — the new certificate listing goes
  through a `certificate` tRPC router → `certificateService` → `enrollmentRepository`; no DB access
  in the router.
- **ADR-012 (semantic search)** — not directly touched, but the certificate query must not perturb
  existing enrollment relation helpers; a new dedicated repo method is added rather than overloading
  `findByIdWithRelations`.
- **Component conventions (CLAUDE.md):** colocated `types.ts`, no nested ternaries (empty-state vs
  list handled by sequential boolean guards / extracted sub-components), sub-components own layout.
- **Email criticality model (`resend-react-email` spec):** `course.certificate` and
  `engagement.near-completion` are STANDARD → `emailService` already enforces opt-out; no opt-out
  logic is re-added here.

## Data model

No schema changes. The existing `NotificationLog` model (unique `dedupKey`) is reused for dedup.

Dedup keys (new automation values, no date component → "once per enrollment, ever"):

- Certificate: `dedupKey = "<studentId>:certificate:<courseId>"`, `automation = "certificate_earned"`.
- Near-completion: `dedupKey = "<studentId>:near_completion:<courseId>"`, `automation = "near_completion"`.

`tryLog` is called **before** sending; send proceeds only when `created === true`. If the send then
throws, the log row already exists, so a failed send is not retried automatically — acceptable
because the certificate also lives on the My Certificates page and the near-completion nudge is
best-effort (FR10/FR14 require non-blocking, not guaranteed delivery).

## API & contracts

| Procedure / route | Type / auth | Input → Output | Notes |
|-------------------|-------------|----------------|-------|
| `certificate.listEarned` | `studentProcedure` | `void` → `EarnedCertificate[]` | Returns only the caller's completed enrollments (`completedAt != null`). Ownership via `ctx.session.user.id`. |
| `GET /api/certificates/[enrollmentId]?token=…` | route, signed cert token | token → PDF | **Unchanged.** 200 PDF / 401 bad token / 404 not found / 409 not completed. |

`EarnedCertificate` DTO (`server/entities/certificate/certificate.ts`):

```ts
{
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  instructorName: string;
  completedAt: Date;
}
```

The download URL is **not** part of the DTO. The page (RSC) mints the token per row via
`signCertificateToken(enrollmentId)` and builds `${BASE_URL}/api/certificates/${enrollmentId}?token=…`,
keeping token minting server-side (never exposed through the tRPC query / client cache).

## Component / data flow

**Certificates page (happy path):**

```
/dashboard/certificates (RSC)
  └─ api.certificate.listEarned()            → EarnedCertificate[]  (server caller)
  └─ for each: signCertificateToken(id)      → href = /api/certificates/{id}?token=…
  └─ render <CertificatesList> / empty state
        click Download → GET /api/certificates/{id}?token=…
            → verifyCertificateToken → certificateService.renderPdf → application/pdf
```

**Certificate-earned email (within existing lesson-completion flow):**

```
lesson.service.syncProgressAndFireEvents (progress == 100, UNCHANGED)
  └─ void notificationService.fireCertificateEarned(enrollmentId).catch(log)
        ├─ enr = enrollmentRepository.findByIdWithRelations(enrollmentId); if !enr return
        ├─ notificationLogRepository.tryLog({ dedupKey: "<sid>:certificate:<cid>", automation })
        │     created === false → return (FR9: no duplicate)
        ├─ certToken = signCertificateToken(enrollmentId)
        ├─ unsubToken = signUnsubscribeToken(studentId)
        └─ emailService.send({                              (FR7)
              templateKey: "course.certificate",
              toEmail: enr.student.email,
              userId: enr.studentId,                        → opt-out enforced inside (FR8)
              payload: { studentName, courseTitle, instructorName,
                         certificatePdfUrl, unsubscribeUrl } })
        (throw → caught by .catch in lesson.service, progress write already done — FR10)
```

**Near-completion email** is identical in shape: `tryLog("<sid>:near_completion:<cid>")` →
`emailService.send({ templateKey: "engagement.near-completion", … })` with payload
`{ studentName, courseTitle, lessonsRemaining, nextLessonUrl, unsubscribeUrl }` (FR11–FR14).

## File list

**New**
- `server/entities/certificate/certificate.ts` — `EarnedCertificate` type + zod (if needed for output).
- `server/api/routers/certificate.ts` — `certificateRouter` with `listEarned` (`studentProcedure`).
- `app/dashboard/certificates/page.tsx` — RSC: fetch earned certs, mint tokens, render list/empty.
- `app/_components/Certificate/components/CertificatesList/index.tsx` — list of certificate rows.
- `app/_components/Certificate/components/CertificatesList/types.ts` — props for list + row.
- `app/_components/Certificate/components/CertificatesEmptyState/index.tsx` — empty-state (FR2).
- `server/services/certificates/certificate.service.test.ts` — unit test for `listEarned` mapping (if logic added to service).

**Modified**
- `server/repositories/enrollment.repository.ts` — add `findCompletedByStudent(studentId)` returning completed enrollments with course title + instructor name.
- `server/services/certificates/certificate.service.ts` — add `listEarned(studentId)` → maps repo rows to `EarnedCertificate[]`.
- `server/services/notifications/notification.service.ts` — rewrite `fireCertificateEarned` & `fireProgressNearCompletion` to dedup via `tryLog` then send via `emailService` (drop `notificationEmitter`). Keep URL construction.
- `server/api/root.ts` — register `certificate: certificateRouter`.
- `lib/constants/urls/studentsUrls.ts` — add `certificates: "/dashboard/certificates"`.
- `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx` — add "Certificates" student nav item (icon e.g. `Award`).
- `server/services/notifications/notificationEmitter.ts` — **delete** (no remaining callers).
- `server/services/notifications/notificationEmitter.test.ts` (if present) — delete with it.

## Cross-cutting concerns

- **Security / authz:** `listEarned` scopes strictly to `ctx.session.user.id`; the repo method
  filters by `studentId` so no IDOR. Download tokens are minted server-side only and remain
  enrollment-scoped (the route already rejects a token whose `enrollmentId` ≠ path param — FR5).
- **Error handling:** router uses `handleServiceError` like `studentRouter`. Email sends stay inside
  the existing `.catch(log)` in `lesson.service.ts`; service throws are logged via `logger.warn`,
  never surfaced to the student (FR10/FR14).
- **Idempotency / consistency:** `notificationLog.dedupKey` unique constraint + `tryLog` is the
  single dedup point; check-then-send ordering means at-most-once (FR9/FR12).
- **Observability:** keep an info log on email send result (template key, skipped/sent/failed),
  mirroring the old emitter log so dashboards/log greps still find lifecycle-email activity.
- **Performance:** `findCompletedByStudent` is a single indexed query on `Enrollment(studentId, completedAt)`; token minting is in-memory HMAC, negligible per row.

## Risks & mitigations

| Risk | L/I | Mitigation |
|------|-----|------------|
| Failed send after `tryLog` row written → email silently never sent | L/M | Certificate is always available on the My Certificates page (FR1); near-completion is best-effort. Admin can delete the `notificationLog` row to allow a resend. |
| Removing `notificationEmitter` breaks an unseen caller | L/M | Grep confirms only the two `fire*` methods call it; delete only after both are migrated; typecheck/build gate. |
| Many download tokens minted on page render for a student with many completions | L/L | HMAC signing is cheap; lists are small. No caching needed. |

## Rollout / migration

- No DB migration, no new env vars (`CERTIFICATE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
  `BASE_URL` already required).
- n8n inbound routes and `N8N_API_TOKEN` stay for the out-of-scope inactivity job (FR16). The
  outbound `N8N_WEBHOOK_BASE_URL` / `N8N_WEBHOOK_SECRET` env vars become unused by these two events
  but are **not** removed in this change (inactivity automation may still reference the secret).
- Undo: revert the commits; no data backfill, no destructive steps.