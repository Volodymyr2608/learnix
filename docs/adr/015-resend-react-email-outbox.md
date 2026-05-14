# ADR-015: Transactional Email via Resend + React Email

- **Status**: Accepted
- **Date**: 2026-05-12
- **Relates to**: ADR-014 (n8n lifecycle automations) — supersedes the inline-HTML template parts; preserves n8n's orchestration, retry, and `NotificationLog`-based dedup.

## Context

Learnix needs to send email in two distinct shapes:

1. **Auth / transactional** — emails fired from in-app events: `verify-email`, `password-reset` (Better Auth hooks), `welcome` (first verified login), `enrollment.confirmed` (post-enrol).
2. **Lifecycle automations** — `certificate.earned`, `engagement.inactivity-7d`, `engagement.near-completion`. Orchestrated by n8n (ADR-014).

ADR-014 originally specified inline HTML in n8n Set nodes and an `_sub_resend_send` HTTP node that talks to Resend directly. That works but forks the template surface between n8n strings and (future) TypeScript code, and the auth half has no email infrastructure at all.

A heavier design (Postgres outbox + Vercel Cron retry + idempotency keys) was considered and rejected for this stage of the project: the additional infrastructure surface (table, repository, cron handler, secret) outweighs its value when n8n already owns scheduling/retry/dedup for lifecycle, and Better Auth's token IDs are naturally unique for auth flows.

## Decision

A single in-app `EmailService` is the only thing in the system that talks to Resend. All React Email templates live in the Next.js app. n8n keeps orchestrating lifecycle flows and **retains its own retry + `NotificationLog`-based dedup** from ADR-014; its `_sub_resend_send` sub-workflow is replaced by a single HTTP call to a Learnix endpoint.

### Rules

1. **Resend SDK lives in exactly one place**: `server/services/email/email.service.ts`. No other code path may import `resend`.
2. **React Email is the only template format.** Templates are React components under `app/_emails/`, rendered with `@react-email/render` to produce HTML + a plain-text fallback in the same call.
3. **No new persistence.** This spec adds no Postgres tables. The Resend dashboard is the system of record for "what was sent." Auth dedup falls out of Better Auth's unique token IDs; n8n dedup uses ADR-014's existing `NotificationLog`.
4. **`POST /api/emails/send`** is the only ingress for external (n8n) email triggers. Bearer-auth via the existing `N8N_API_TOKEN`. Body shape: `{ templateKey, toEmail, userId?, payload }`. Returns `{ id: string }` (Resend's message id) on success, `{ skipped: "opted_out" }` when opt-out gates the send, or an error status.
5. **Auth flows call the service directly** via `emailService.send(...)` from Better Auth hooks. No webhook round-trip on the critical path.
6. **Synchronous send. No app-side retry.** `send` validates → renders → calls Resend → returns. If Resend errors, the call throws. Better Auth surfaces the error to the user (who can resubmit); n8n retries via its built-in node retry policy.
7. **Opt-out is gated at the service boundary.** `emailService.send` rejects sends to users with `emailNotificationsEnabled = false`, except for the two channels marked `CRITICAL` in the template registry (`auth.verify-email`, `auth.password-reset`).
8. **Template registry is typed.** `email.templates.ts` maps each `templateKey` to a React component, a Zod payload schema, a subject builder, and a `criticality: "CRITICAL" | "STANDARD"` flag. Unknown keys → 400 at the endpoint; invalid payloads → 422.
9. **`From` / `Reply-To` are env-driven.** `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`. Per-template overrides live in the registry, not in callers.

## Consequences

**Positive**
- One Resend integration, one template format. Branding, footer, unsubscribe link all share code.
- No new infrastructure: no new tables, no new env secrets beyond `RESEND_API_KEY` / `EMAIL_FROM_ADDRESS` / `EMAIL_REPLY_TO`, no cron.
- n8n workflows shrink: lifecycle flows go from 6–8 nodes to ~4 (verify HMAC → opt-out → POST to `/api/emails/send`).
- Local dev: a single Resend test key + `pnpm email:dev` (React Email preview server) — no n8n required to iterate on auth templates.

**Negative / Trade-offs**
- **No persistent log of sends.** If a user asks "did the welcome email actually go out?", the only place to check is the Resend dashboard. Acceptable at pet-project scale; revisit by adding a small `EmailLog` table if support questions justify it.
- **No app-side retry.** A Resend hiccup during signup means the verify-email is lost; user must click "resend verification." Lifecycle sends are still safe because n8n owns their retries.
- **Render errors only surface at send time.** A template bug for `course.certificate` would be caught only when n8n actually fires the workflow, not at deploy time. Mitigated by Zod payload validation + the `pnpm email:dev` preview pass in local development.
- **The single `EmailService` becomes a chokepoint.** If it has a bug, every email path is affected. Mitigated by the typed template registry and Zod payload validation at the boundary.