# Requirements: n8n Lifecycle Automations

## Status: planned — Phase 12

## Problem

Learnix has rich lifecycle signal — `LessonProgress`, `Enrollment.completedAt`, `lastActivityAt` — but no outbound communication. Students who complete a course don't get a certificate. Students who go inactive aren't nudged back. Students who are 1–2 lessons from finishing don't get the "you're almost there" push that converts intent into completion.

These automations are off the critical authoring/learning path; baking them into the Next.js app forces ops/marketing tweaks through a deploy. n8n is a better fit: scheduled jobs, webhook handlers, multi-step branches, and a UI non-engineers can edit.

## Goal

Three production-grade lifecycle email automations, delivered via a self-hosted n8n instance integrated with Learnix over signed HTTP. v1 is email-only; the integration shape (events, signing, dedup, opt-out) is designed so adding Slack/Discord/SMS later is "add another node," not "rewrite the contract."

| Automation | Trigger | Effect |
|---|---|---|
| Completion certificate | Event: `certificate.earned` | Email with attached PDF certificate. |
| Inactivity nudge | Cron: daily 09:00 UTC | Email to students inactive 7 days with mid-course progress. |
| Near-completion nudge | Event: `progress.near_completion` | Email when a student reaches 1–2 lessons remaining (fires once per course). |

## Architectural decisions

- **ADR-007** — Vercel Blob handles uploads, not certificates. Certificates are rendered on demand, not stored.
- **ADR-010** — typed domain errors mapped to HTTP errors on the notification endpoints.
- **ADR-011** — component folder architecture for the `Certificate` PDF document.
- **New decision (this spec):** outbound webhooks (Learnix → n8n) for real-time events; n8n cron pulling Learnix endpoints for scheduled scans. n8n never connects to the database directly. Recorded as ADR-014.
- **New decision (this spec):** `@react-pdf/renderer` for the certificate PDF — pure JS, fits Vercel Hobby, ~200ms render. Recorded as part of ADR-014.
- **New decision (this spec):** self-hosted n8n on Railway/Render/Fly. Pet-project-budget friendly; portable.

## Functional requirements

| Surface | Behaviour |
|---|---|
| Outbound webhooks | `certificate.earned`, `progress.near_completion`. HMAC-SHA256 signed. At-least-once with 3 retries (1s/5s/25s exponential backoff). |
| Inbound API | `GET /api/notifications/inactive-students`, `POST/DELETE /api/notifications/log`, `GET /api/certificates/[enrollmentId]`. Bearer-token authenticated. |
| Opt-out | Single boolean `User.emailNotificationsEnabled` (default `true`). Public `/unsubscribe?token=` page flips it. Every workflow gates on it. |
| Idempotency | Server-owned `NotificationLog` table with `dedupKey` unique constraint. n8n only sends if `POST /api/notifications/log` returns `created: true`. n8n rolls back via `DELETE` if downstream send fails. |
| Certificate PDF | Rendered on demand by `app/api/certificates/[enrollmentId]/route.ts` using `@react-pdf/renderer`. Auth via short-lived JWT in `?token=`. |
| Inactivity criteria | `LessonProgress.updatedAt < now - 7d` AND course completion 10%–99%. |
| Near-completion criteria | `lessonsRemaining ∈ {1, 2}` after a lesson is marked complete; one email per (user, course). |
| Cron cadence | Inactivity workflow runs once daily at 09:00 UTC in v1. Per-timezone delivery is deferred. |
| Rate limiting | Resend send throttled to 8 req/s in n8n (free-tier ceiling). |

## Architecture

```
                      ┌──────────────────────────┐
                      │  Learnix (Next.js/Vercel)│
                      │                          │
   event-driven ─────►│ NotificationEmitter      │──── HTTPS POST + HMAC ───┐
                      │  ├─ certificate.earned   │                          │
                      │  └─ progress.near_done   │                          ▼
                      │                          │              ┌─────────────────────┐
                      │ /api/notifications/* GETs│◄── pulls ────│   n8n (self-hosted) │
                      │  ├─ inactive-students    │  scheduled   │                     │
                      │  ├─ certificate-pdf      │              │ ┌─ Workflows ─────┐ │
                      │  ├─ log (POST/DELETE)    │              │ │ • Certificate   │ │
                      │  └─ unsubscribe (public) │              │ │ • Inactivity    │ │
                      └──────────────────────────┘              │ │ • Near-complete │ │
                                                                │ └─────────────────┘ │
                      ┌──────────────────────────┐              │ ┌─ Sub-workflows ─┐ │
                      │   Resend (email)         │◄── HTTP ─────│ │ • Verify HMAC   │ │
                      └──────────────────────────┘              │ │ • Email skeleton│ │
                                                                │ │ • Resend send   │ │
                                                                │ └─────────────────┘ │
                                                                └─────────────────────┘
```

**Auth:**
- Outbound (Learnix → n8n): HMAC-SHA256 over body using `N8N_WEBHOOK_SECRET`; signature in `X-Learnix-Signature: sha256=<hex>`. n8n's first node verifies.
- Inbound (n8n → Learnix): `Authorization: Bearer ${N8N_API_TOKEN}` on every call. Validated in a shared route-handler guard.
- Public endpoints (unsubscribe, certificate fetch with JWT): no bearer; JWT signed with `N8N_API_TOKEN` carries authority.

**Idempotency:** `NotificationLog.dedupKey` is the single source of truth. n8n's flow is `log → send`; if `log` returns `created: false`, exit. If `send` fails, call `DELETE log` to roll back so the next run retries.

## Event contract (outbound)

### `certificate.earned`

Fired from `LessonService.markLessonComplete` once the new `LessonProgress` causes course completion to reach 100%.

```json
{
  "eventId": "evt_clx...",
  "type": "certificate.earned",
  "occurredAt": "2026-05-12T10:00:00Z",
  "user": {
    "id": "...",
    "email": "...",
    "name": "...",
    "emailNotificationsEnabled": true,
    "unsubscribeToken": "tok_..."
  },
  "course": {
    "id": "...",
    "title": "...",
    "slug": "...",
    "instructorName": "..."
  },
  "enrollment": {
    "id": "...",
    "completedAt": "..."
  },
  "certificatePdfUrl": "https://learnix.app/api/certificates/<enrollmentId>?token=<jwt>"
}
```

### `progress.near_completion`

Fired from the same hook when `lessonsRemaining ∈ {1, 2}`. Guarded server-side by `NotificationLog` so it fires at most once per `(userId, courseId)`.

```json
{
  "eventId": "evt_clx...",
  "type": "progress.near_completion",
  "occurredAt": "2026-05-12T10:00:00Z",
  "user": { "id": "...", "email": "...", "name": "...",
            "emailNotificationsEnabled": true, "unsubscribeToken": "tok_..." },
  "course": { "id": "...", "title": "...", "slug": "..." },
  "progress": {
    "completedLessons": 18,
    "totalLessons": 20,
    "lessonsRemaining": 2,
    "nextLessonId": "...",
    "nextLessonTitle": "..."
  }
}
```

## Inbound API

Plain Next.js route handlers under `app/api/notifications/`, gated by `Authorization: Bearer ${N8N_API_TOKEN}` except where noted.

| Method · Path | Purpose |
|---|---|
| `GET /api/notifications/inactive-students` | Query: `inactiveDays=7&minProgressPct=10&maxProgressPct=99&dryRun=false`. Returns `{ students: [{ userId, email, name, emailNotificationsEnabled, courses: [{ courseId, courseTitle, progressPct, nextLessonTitle, lastActivityAt, dedupKey }] }], generatedAt }`. |
| `POST /api/notifications/log` | Body: `{ dedupKey, userId, automation, payload? }`. Returns `{ created: true \| false }`. Backed by the unique constraint. |
| `DELETE /api/notifications/log?dedupKey=...` | Removes a log row to allow retry after a downstream failure. |
| `GET /api/certificates/[enrollmentId]?token=<jwt>` | Public (auth via JWT). Returns `application/pdf`. |
| `GET /unsubscribe?token=<jwt>` | Public page. Flips `User.emailNotificationsEnabled = false`. |

JWT tokens are signed with `N8N_API_TOKEN`; 30-day expiry for certificate tokens, no expiry for unsubscribe tokens (no DB column needed).

## Data model

### New: `prisma/schema/notification.prisma`

```prisma
model NotificationLog {
  id         String   @id @default(cuid())
  userId     String
  automation String   // "certificate" | "inactivity_7d" | "near_completion"
  dedupKey   String   @unique
  payload    Json
  sentAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, automation])
  @@map("notification_logs")
}
```

### Modify: `prisma/schema/auth.prisma`

Add to `User`:

```prisma
emailNotificationsEnabled Boolean @default(true)
```

### Dedup key conventions

- Inactivity: `${userId}:inactivity_7d:${courseId}:${YYYY-MM-DD}` — one per user/course/day.
- Near-completion: `${userId}:near_completion:${courseId}` — once per user/course, forever.
- Certificate: `${userId}:certificate:${enrollmentId}` — once per enrollment.

## Workflow 1 — Certificate (event-driven)

```
[Webhook: POST /webhook/certificate.earned]
       ▼
[Function: verify HMAC]                          ← rejects 401 on mismatch
       ▼
[IF: user.emailNotificationsEnabled == true]
       ▼
[HTTP: POST /api/notifications/log
       body: { dedupKey, userId, automation: "certificate", payload }]
       ▼
[IF: response.created == true]
       ▼
[HTTP: GET certificatePdfUrl]                    ← application/pdf bytes
       ▼
[Set: build email payload
       to: user.email
       subject: "🎓 You completed {{course.title}}"
       html: <skeleton + body referencing user.name, course, instructor, unsubscribe link>
       attachments: [{ filename: "{{course.slug}}-certificate.pdf",
                       content: <base64 of step above> }]]
       ▼
[Resend: POST https://api.resend.com/emails]     ← On Error → DELETE log
```

8 nodes. The HMAC verify, log, and Resend send are extracted into **sub-workflows** shared with the other two flows.

## Workflow 2 — Inactivity (cron-driven)

```
[Cron: daily 09:00 UTC]
       ▼
[HTTP: GET /api/notifications/inactive-students
            ?inactiveDays=7&minProgressPct=10&maxProgressPct=99]
       ▼
[Split In Batches: 50 students per batch]
       ▼ (per item)
[IF: emailNotificationsEnabled == true]
       ▼
[HTTP: POST /api/notifications/log
       body: { dedupKey, userId, automation: "inactivity_7d", payload }]
       ▼
[IF: response.created == true]
       ▼
[Set: build email payload
       subject: "Pick up where you left off in {{course.title}}"
       html: <skeleton + body referencing nextLessonTitle, progressPct, deep link>]
       ▼
[Resend: POST /emails]                            ← throttled to 8 req/s
```

7 nodes. Re-running the same calendar day is a no-op via the `:YYYY-MM-DD` dedup key.

## Workflow 3 — Near-completion (event-driven)

```
[Webhook: POST /webhook/progress.near_completion]
       ▼
[Function: verify HMAC]
       ▼
[IF: user.emailNotificationsEnabled == true]
       ▼
[HTTP: POST /api/notifications/log
       body: { dedupKey: "${userId}:near_completion:${courseId}", ... }]
       ▼
[IF: response.created == true]
       ▼
[Set: build email payload
       subject: "{{progress.lessonsRemaining}} lessons left in {{course.title}} 🏁"
       html: <skeleton + remaining-count callout + nextLessonUrl>]
       ▼
[Resend: POST /emails]                            ← On Error → DELETE log
```

6 nodes. Learnix already guards near-completion server-side via `NotificationLog`; the n8n log call is defense in depth.

## Email templates

For v1 the three templates live inline in n8n's Set nodes as HTML strings with `{{ $json.user.name }}` interpolation. All three share an HTML skeleton (logo, footer with unsubscribe link) extracted into the `render_email_skeleton` sub-workflow.

Migration to React Email + a Learnix render endpoint is a deferred enhancement when designs grow.

## Certificate rendering (Learnix side)

**Route:** `app/api/certificates/[enrollmentId]/route.ts`

1. Verify `?token=` JWT signed with `N8N_API_TOKEN`; claim `{ enrollmentId, exp }`. 401 on mismatch.
2. Load enrollment + course + user; 404 if missing.
3. Confirm `enrollment.completedAt != null`; 409 otherwise.
4. `renderToBuffer(<CertificateDocument ... />)` via `@react-pdf/renderer`.
5. Return as `application/pdf` with `Content-Disposition: attachment; filename="${course.slug}-certificate.pdf"`.

**Service & components (per ADR-011):**

```
server/services/certificates/
  certificate.service.ts        renders PDF buffer; signs/verifies tokens
  certificate.errors.ts

app/_components/Certificate/
  CertificateDocument.tsx       @react-pdf/renderer <Document>
  components/
    CertificateHeader.tsx       logo + "Certificate of Completion"
    CertificateBody.tsx         "{{name}} has completed {{course title}}"
    CertificateFooter.tsx       date, instructor signature, course id
  styles.ts                     react-pdf StyleSheet (not Tailwind — different runtime)
```

No PDF caching in v1; render is ~200ms. Add S3/R2 cache keyed by `enrollmentId` when re-issue volume justifies it.

## Notification emitter (Learnix side)

`server/services/notifications/notificationEmitter.ts`:

```ts
notificationEmitter.emit("certificate.earned", payload)
notificationEmitter.emit("progress.near_completion", payload)
```

Internally: assigns `eventId`, signs body, POSTs to `${N8N_WEBHOOK_BASE_URL}/${eventType}`, retries 3× with exponential backoff. Fire-and-forget from callers (matches the existing embeddings hook pattern). Logs `{ eventId, eventType, status, attempts, latencyMs }` via `pino`.

## Failure modes

| Failure | Behaviour |
|---|---|
| n8n unreachable when Learnix emits | Emitter retries 3× then logs `eventId` at `error` level. Learnix request flow unaffected. |
| HMAC verification fails on n8n | Workflow returns 401; Learnix retries. Persistent → investigate secret drift. |
| Resend rate limit / outage | n8n's per-node retry 3× then rolls back the log row via `DELETE /api/notifications/log` so the next run can retry. |
| Certificate PDF render fails | 500 from `/api/certificates/...`; n8n retries 3× then rolls back log row. Email not sent without attachment. |
| JWT expired | 30-day expiry well beyond any retry window. Expired → 401 → rollback → next emission re-issues fresh token. |
| User opts out mid-workflow | Every workflow has an `emailNotificationsEnabled == true` IF-node. Already-queued executions may slip through — acceptable. |
| Dedup key collision under concurrency | `@unique` constraint is the arbiter. Loser exits with `created: false`. |
| `/api/notifications/log` down | n8n retries 3× then halts execution; visible in n8n execution log for manual replay. |
| Course unpublished after enrollment | Repository honours `course.deletedAt`; cert endpoint 404s; rollback. |
| Inactivity scan returns 10k students | Split-In-Batches handles backpressure; ~25 min run at 8 req/s. Daily cadence unchanged. |

## Monitoring (v1)

- n8n built-in execution log; retain 60 days.
- `GET /healthz` on n8n pinged by UptimeRobot or platform-native check; alert on 2 consecutive failures.
- `pino` logs every emitter call; filter `status=failed` to surface unsent events.
- Resend dashboard weekly eyeball (delivery, bounce, complaint).
- No metrics infra in v1. Add `NotificationLog.deliveryStatus` + admin query when volume justifies.

## Dev workflow

**Local stack:**

```
docker-compose.yml          existing — Postgres on 5433
docker-compose.n8n.yml      NEW — n8n on 5678 with persistent volume
```

`pnpm dev:n8n` alias to start n8n. Local Learnix → local n8n: `N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook`. Local n8n → local Learnix: `http://host.docker.internal:3000` (Linux: `--add-host`).

**Workflow versioning:**

```
n8n/
  workflows/
    certificate.json
    inactivity.json
    near-completion.json
    _sub_render_email_skeleton.json
    _sub_resend_send.json
    _sub_verify_hmac.json
  README.md
scripts/
  sync-n8n-workflows.ts       idempotent PUT to n8n REST API
```

`pnpm sync:n8n` uploads workflows to the configured n8n instance. Credentials are not in the JSON — they live in n8n's encrypted credentials store keyed by name (`resend-api`, `learnix-api`).

**Testing:**

- Resend test mode (`re_test_...` API key) — emails accepted, not delivered.
- `notifications.emitTest({ type, userId, courseId })` — dev-only tRPC procedure, gated on `env.NODE_ENV === "development"`.
- `pnpm tsx scripts/fire-test-event.ts certificate.earned` — CLI fires synthetic events through the real emitter.
- `GET /api/notifications/inactive-students?dryRun=true` — returns candidates without triggering anything.

**Production rollout:**

1. Deploy n8n to Railway/Render/Fly with persistent volume + HTTPS hostname.
2. Set credentials in n8n UI (Resend, Learnix API).
3. `pnpm sync:n8n` to upload workflow JSON.
4. Set Learnix env vars on Vercel; redeploy.
5. Smoke test: `notifications.emitTest certificate.earned` against a test account.

## Files to create / modify

| Action | Path |
|---|---|
| New Prisma model | `prisma/schema/notification.prisma` (`NotificationLog`) |
| Modify | `prisma/schema/auth.prisma` — `User.emailNotificationsEnabled` |
| New migration | `prisma/migrations/<ts>_add_notification_logs/migration.sql` |
| New repository | `server/repositories/notificationLog.repository.ts` |
| New service | `server/services/notifications/notificationEmitter.ts` |
| New service | `server/services/notifications/notification.service.ts` |
| New service | `server/services/certificates/certificate.service.ts` |
| New errors | `server/services/notifications/notification.errors.ts`, `server/services/certificates/certificate.errors.ts` |
| New route | `app/api/notifications/inactive-students/route.ts` |
| New route | `app/api/notifications/log/route.ts` (POST + DELETE) |
| New route | `app/api/certificates/[enrollmentId]/route.ts` |
| New page | `app/unsubscribe/page.tsx` |
| Modify | `server/services/lesson/lesson.service.ts` — fire emitter on `markLessonComplete` after computing progress |
| Modify | `lib/env.js` — `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`, `N8N_API_TOKEN` |
| New component dir | `app/_components/Certificate/` (5 files) |
| New | `docker-compose.n8n.yml` |
| New | `n8n/workflows/*.json` (3 workflows + 3 sub-workflows) |
| New | `n8n/README.md` |
| New | `scripts/sync-n8n-workflows.ts` |
| New | `scripts/fire-test-event.ts` (dev-only) |
| New tRPC | `server/api/routers/notifications.ts` (single `emitTest` procedure, dev-gated) |
| Modify | `server/api/root.ts` — register `notifications` router |
| New ADR | `docs/adr/014-n8n-lifecycle-automations.md` |
| Modify | `docs/specs/roadmap.md` — Phase 12 entry |
| Modify | `docs/README.md` — link this spec and ADR-014 |

## Estimated effort

| Task | Time |
|---|---|
| Prisma changes + migration + repository | 0.5 day |
| Notification emitter (sign + retry + log) | 0.5 day |
| Inbound routes (inactive-students, log POST/DELETE) + auth guard | 0.5 day |
| Certificate service + components + cert route | 1 day |
| Unsubscribe page + JWT helpers | 0.5 day |
| `lesson.service` hook + payload assembly | 0.5 day |
| Local n8n setup (`docker-compose.n8n.yml`) + workflow scaffolding | 0.5 day |
| Three workflows + three sub-workflows in n8n | 1 day |
| `sync-n8n-workflows.ts` + workflow JSON export/commit | 0.5 day |
| Dev-only `emitTest` + `fire-test-event.ts` + end-to-end manual test | 0.5 day |
| Production rollout (deploy n8n, credentials, env vars, smoke test) | 0.5 day |
| ADR-014 + roadmap + README updates | 0.25 day |
| **Total** | **~7 days** |