# Requirements: Resend + React Email

## Status: planned — Phase 13

## Problem

Learnix has no outbound email today. Better Auth verification and password-reset flows log links to the console; signup is gated only because dev users read the terminal. Lifecycle automations (Phase 12, ADR-014) are designed to send via n8n's own `_sub_resend_send` HTTP node with inline HTML templates — that works for the three lifecycle channels but leaves auth/transactional emails uncovered and forks the template surface between n8n strings and (future) TypeScript code.

Without a unified solution:
- Auth emails can't ship at all.
- Lifecycle templates can't share a footer/header with auth templates — branding drifts.
- Every email-touching feature has to re-decide: send from the app or punt to n8n?

## Goal

A single in-app `EmailService` is the only code that talks to Resend. All templates are React Email components in `app/_emails/`. Auth flows call the service directly; n8n calls it via `POST /api/emails/send`. **No new persistence layer** — Resend is the system of record; n8n keeps its own dedup/retry from ADR-014; auth uses Better Auth's unique token IDs naturally. Seven templates ship in v1.

| Channel | Template key | Trigger |
|---|---|---|
| Auth | `auth.verify-email` | Better Auth `sendVerificationEmail` hook |
| Auth | `auth.password-reset` | Better Auth `sendResetPassword` hook |
| Transactional | `user.welcome` | First verified login |
| Transactional | `enrollment.confirmed` | `EnrollmentService.enrollInCourse` |
| Lifecycle | `course.certificate` | n8n `certificate` workflow |
| Lifecycle | `engagement.inactivity-7d` | n8n daily inactivity cron |
| Lifecycle | `engagement.near-completion` | n8n `near-completion` workflow |

## Architectural decisions

- **ADR-015 (this spec)** — Resend + React Email. Adds the in-app send path and the unified template format; defers retry/dedup to the surrounding systems.
- **ADR-014** — n8n still owns scheduling, HMAC-signed event ingestion, branching, opt-out gate, batching, retry policy, and `NotificationLog` dedup. Its `_sub_resend_send` sub-workflow becomes a single HTTP node calling `POST /api/emails/send`.
- **ADR-010** — typed domain errors map to HTTP status codes on the send endpoint.
- **ADR-011** — component folder architecture for `app/_emails/` (one folder per template).

## Functional requirements

| Surface | Behaviour |
|---|---|
| `emailService.send` | Validates `templateKey` against registry. Validates payload against template's Zod schema. Applies opt-out gate (skip for non-`CRITICAL` templates when `user.emailNotificationsEnabled = false`). Renders HTML + plain-text via `@react-email/render`. Calls `resend.emails.send`. Returns `{ id: string }` on success, `{ skipped: "opted_out" }` when gated. Throws on invalid template, invalid payload, or Resend error. |
| `POST /api/emails/send` | Bearer-auth via `N8N_API_TOKEN`. Body: `{ templateKey, toEmail, userId?, payload }`. Calls `emailService.send`. Returns the service result (200) or maps thrown errors: 400 unknown template, 422 invalid payload, 401 bad token, 502 Resend failure. |
| Opt-out gate | `emailService.send` checks `user.emailNotificationsEnabled` when `userId` is provided. If false AND template `criticality !== "CRITICAL"`, skip and return `{ skipped: "opted_out" }`. `CRITICAL`: `auth.verify-email`, `auth.password-reset`. |
| Better Auth integration | `sendVerificationEmail` and `sendResetPassword` call `emailService.send` directly. Failures propagate to Better Auth's response so the user can retry. |
| Welcome email | Fires from the dashboard layout server component on the first authenticated render after `User.emailVerified === true`. A `User.welcomeEmailSentAt DateTime?` column gates the call. (Single DB column is acceptable — it's not "new persistence" in the outbox sense; it's a small flag on an existing row.) |
| Enrollment confirmation | Fires from `EnrollmentService.enrollInCourse` after successful insert. Fire-and-forget (`void emailService.send(...).catch(...)`) so an email failure does not roll back the enrolment. |
| n8n retry & dedup | Owned by ADR-014 — n8n's HTTP-node retry policy handles transient Resend failures; `NotificationLog` (ADR-014) prevents duplicate sends for lifecycle automations. |
| Render preview | `pnpm email:dev` runs `react-email`'s dev server pointing at `app/_emails/`. Hot-reload of all seven templates. |
| Plain-text fallback | Every send includes a `text` body produced by `@react-email/render`'s plain-text mode. |

## Architecture

```
                ┌─────────── App (Next.js / Vercel) ───────────┐
                │                                                │
  Better Auth   │ sendVerificationEmail / sendResetPassword      │
   hooks  ─────►│                                                │
                │       ┌─► EmailService.send ◄──────────────┐   │
  Service ─────►│       │   (validate → render → Resend)     │   │
  events        │       │                                    │   │
  (enroll,      │       │                                    │   │
   welcome)     │       │                                    │   │
                │ POST /api/emails/send ◄────── n8n ─────────┘   │
                │       │                                        │
                └───────┼────────────────────────────────────────┘
                        ▼
                 ┌───────────────┐
                 │    Resend     │
                 └───────────────┘
```

**Trust boundaries:**
- Better Auth hooks → `EmailService`: in-process, no auth needed.
- Service events → `EmailService`: in-process.
- n8n → `POST /api/emails/send`: `Authorization: Bearer ${N8N_API_TOKEN}` (existing token, ADR-014).

## Data model

### Modify: `prisma/schema/auth.prisma`

Add to `User`:

```prisma
welcomeEmailSentAt DateTime?
```

That's the only schema change in this spec. The `emailNotificationsEnabled Boolean @default(true)` field is added by Phase 12 (ADR-014); if Phase 12 has not shipped, add it here.

### No outbox table

There is no `EmailOutbox`. The Resend dashboard is the durable record of what was sent. If a support question later requires "did email X go out?", check Resend, not the database.

## Template registry

`server/services/email/email.templates.ts`:

```ts
type TemplateEntry<P> = {
  component: ComponentType<P>;
  payload: ZodSchema<P>;
  subject: (payload: P) => string;
  criticality: "CRITICAL" | "STANDARD";
  from?: string;
  replyTo?: string;
};

export const emailTemplates = {
  "auth.verify-email":          { /* ... */ criticality: "CRITICAL" },
  "auth.password-reset":        { /* ... */ criticality: "CRITICAL" },
  "user.welcome":               { /* ... */ criticality: "STANDARD" },
  "enrollment.confirmed":       { /* ... */ criticality: "STANDARD" },
  "course.certificate":         { /* ... */ criticality: "STANDARD" },
  "engagement.inactivity-7d":   { /* ... */ criticality: "STANDARD" },
  "engagement.near-completion": { /* ... */ criticality: "STANDARD" },
} as const satisfies Record<string, TemplateEntry<any>>;

export type TemplateKey = keyof typeof emailTemplates;
```

## React Email file layout

```
app/_emails/
  _shared/
    EmailLayout.tsx          logo, container, footer skeleton
    EmailButton.tsx          branded CTA
    EmailFooter.tsx          unsubscribe link, address line
  AuthVerifyEmail.tsx
  AuthPasswordResetEmail.tsx
  UserWelcomeEmail.tsx
  EnrollmentConfirmedEmail.tsx
  CourseCertificateEmail.tsx
  EngagementInactivityEmail.tsx
  EngagementNearCompletionEmail.tsx
```

Each template is a default-exported React component with strongly-typed props. Templates import only from `@react-email/components` and `./_shared/*`. No Tailwind in templates — `@react-email/components`' inline-style shims handle email-client compatibility.

## Endpoint contracts

### `POST /api/emails/send`

Request:
```json
{
  "templateKey": "course.certificate",
  "toEmail": "student@example.com",
  "userId": "usr_abc",
  "payload": {
    "studentName": "Ada",
    "courseTitle": "Intro to RAG",
    "instructorName": "Alan",
    "certificatePdfUrl": "https://learnix.app/api/certificates/enr_abc123?token=...",
    "unsubscribeUrl": "https://learnix.app/unsubscribe?token=..."
  }
}
```

Responses:
- `200 { id: "re_abc..." }` — sent. `id` is Resend's message id.
- `200 { skipped: "opted_out" }` — user has opted out and template is not `CRITICAL`. n8n treats this as success and exits.
- `400 { error: "unknown_template" }` — `templateKey` not in registry.
- `401 { error: "unauthorized" }` — bad/missing bearer.
- `422 { error: "invalid_payload", issues: [...] }` — Zod failures.
- `502 { error: "resend_failed", detail: "..." }` — Resend SDK returned an error. n8n's HTTP-node retry policy handles it.

## Failure modes

| Failure | Behaviour |
|---|---|
| Resend rate limit (429) | `emailService.send` throws → endpoint returns 502 → n8n retries per its own policy. For auth hooks, Better Auth surfaces a generic "couldn't send email, try again" to the user. |
| Resend hard outage | Same as 429. Auth flows degrade to "user retries the signup form." Lifecycle flows: n8n's retry tail covers it; eventual delivery is on the order of minutes. |
| Template registry mismatch | 400 at endpoint; in-process callers get `UnknownTemplateError`. |
| Invalid payload | 422 at endpoint; in-process callers get `InvalidPayloadError` (Zod issues attached). |
| User opts out | `emailService.send` returns `{ skipped: "opted_out" }`. `CRITICAL` templates ignore the flag. |
| `userId` provided but user not found | Treat as opt-out gate non-applicable (no flag to check); proceed with send. |
| Render throws (template bug) | `emailService.send` throws → endpoint returns 502 (or auth hook surfaces error). Fix the template; redeploy; resend. No retry loop. |
| Better Auth signup with unreachable Resend | Better Auth returns its own error; user retries the form. |

## Monitoring (v1)

- `console.error` on every send failure with `{ templateKey, toEmail, error }`. Vercel logs are the v1 audit trail.
- Resend dashboard weekly eyeball (delivery, bounce, complaint).
- No metrics infra. Defer admin dashboard until volume justifies.

## Dev workflow

**Local stack:**

- `pnpm dev` — Next.js app.
- `pnpm email:dev` — `react-email dev` server on port 3001, previews `app/_emails/` with mock props.
- `RESEND_API_KEY=re_test_...` — Resend's test key (accepts but does not deliver).
- Optional: `pnpm dev:n8n` (from ADR-014) — only needed when exercising lifecycle workflows.

**Manual send test:**

```bash
curl -X POST http://localhost:3000/api/emails/send \
  -H "Authorization: Bearer $N8N_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "templateKey": "user.welcome", "toEmail": "you@example.com",
         "userId": "<userId>",
         "payload": { "name": "Test", "browseUrl": "http://localhost:3000/dashboard/browse",
                      "unsubscribeUrl": "http://localhost:3000/unsubscribe?token=demo" } }'
```

## Files to create / modify

| Action | Path |
|---|---|
| Modify | `prisma/schema/auth.prisma` — add `welcomeEmailSentAt` (and `emailNotificationsEnabled` if Phase 12 hasn't shipped) |
| New migration | `prisma/migrations/<ts>_add_welcome_email_sent_at/migration.sql` |
| New service | `server/services/email/email.service.ts` |
| New | `server/services/email/email.templates.ts` (registry) |
| New | `server/services/email/email.renderer.ts` (`@react-email/render` wrapper) |
| New errors | `server/services/email/email.errors.ts` |
| New route | `app/api/emails/send/route.ts` |
| New components | `app/_emails/_shared/EmailLayout.tsx`, `EmailButton.tsx`, `EmailFooter.tsx` |
| New components | `app/_emails/AuthVerifyEmail.tsx`, `AuthPasswordResetEmail.tsx`, `UserWelcomeEmail.tsx`, `EnrollmentConfirmedEmail.tsx`, `CourseCertificateEmail.tsx`, `EngagementInactivityEmail.tsx`, `EngagementNearCompletionEmail.tsx` |
| Modify | `server/better-auth/server.ts` — wire `sendVerificationEmail`, `sendResetPassword` to `emailService.send` |
| Modify | `server/services/enrollment/enrollment.service.ts` — fire `enrollment.confirmed` after enrol |
| Modify | dashboard root layout (server component) — fire `user.welcome` once per user, gated by `welcomeEmailSentAt` |
| Modify | `lib/env.js` — `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO` |
| Modify | n8n workflows (cert / inactivity / near-completion) — replace `_sub_resend_send` with single HTTP POST to `/api/emails/send`. n8n's `NotificationLog` POST/DELETE flow stays. |
| Modify | `package.json` — `"email:dev": "email dev --dir app/_emails --port 3001"` |
| New ADR | `docs/adr/015-resend-react-email-outbox.md` |
| Modify | `docs/specs/roadmap.md` — Phase 13 entry |
| Modify | `docs/README.md` — link this spec and ADR-015 |
| Add deps | `resend`, `@react-email/components`, `@react-email/render`, `react-email` (dev) |

## Estimated effort

| Task | Time |
|---|---|
| Schema change + migration | 0.25 day |
| Template registry, renderer, error types | 0.5 day |
| `EmailService` (validate + opt-out + render + send) | 0.25 day |
| Seven React Email templates + shared layout | 1.5 days |
| `POST /api/emails/send` + auth guard | 0.25 day |
| Better Auth hook wiring (verify, reset) | 0.5 day |
| Welcome + enrollment.confirmed wiring | 0.5 day |
| n8n workflow surgery (drop `_sub_resend_send`, point to `/api/emails/send`) | 0.5 day |
| Local preview (`pnpm email:dev`) + end-to-end manual run | 0.5 day |
| ADR-015 + roadmap + README updates | 0.25 day |
| **Total** | **~5 days** |

## Out of scope

- **Marketing / broadcast email.** Anything that targets a list of users en masse is deferred.
- **Email open / click tracking.** Resend supports it; v1 does not enable it.
- **i18n.** All seven templates ship in English. Locale-aware rendering is a future enhancement.
- **In-app inbox.** Some products mirror sent emails into an in-app notification UI. Deferred.
- **Attachment uploads via the endpoint.** `course.certificate` does *not* attach the PDF in the email — the email carries a download link.
- **Custom domain authentication (SPF/DKIM/DMARC).** Configured operationally in Resend, not in code.
- **Persistent send log.** If audit/replay needs grow, add an `EmailLog` table later — out of v1 scope.