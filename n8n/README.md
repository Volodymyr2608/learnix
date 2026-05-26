# n8n Lifecycle Automations

Three workflows for Learnix lifecycle emails: certificate earned, inactivity nudge (daily cron), near-completion nudge.

## Local setup

1. `pnpm dev:n8n` — starts n8n at http://localhost:5678
2. Complete owner setup in the UI.
3. **Settings → API** → enable + copy the API key → set it as `N8N_API_TOKEN` in `.env.local` (same value used for Bearer auth).
4. Create credentials (see below).
5. **Settings → Environment Variables** → add:
   - `N8N_WEBHOOK_SECRET` = value from `.env.local`
   - `BASE_URL` = `http://host.docker.internal:3000`
6. `pnpm sync:n8n` — uploads the workflow JSONs from `n8n/workflows/`.
7. Activate all three workflows in the n8n UI.

## Credentials

Create in **Credentials → New Credential → Bearer Auth**:

| Name | Token |
|---|---|
| `learnix-api` | `<N8N_API_TOKEN>` |

Credential values are **not** stored in the workflow JSONs.

## Production setup

1. Deploy with `docker-compose.n8n.prod.yml` (Postgres backend).
2. Set env vars: `N8N_DOMAIN`, `N8N_ENCRYPTION_KEY`, `N8N_DB_PASSWORD` (see `.env.n8n.example`).
3. Open the n8n HTTPS URL, create credentials and env vars with production values:
   - `N8N_WEBHOOK_SECRET` = production secret
   - `BASE_URL` = `https://yourdomain.com`
4. `pnpm sync:n8n` (reads `N8N_API_TOKEN` and `N8N_WEBHOOK_BASE_URL` from env)
5. Activate workflows. Smoke-test with `pnpm tsx scripts/fire-test-event.ts`.

## Workflow files

| File | Trigger | Description | Docs |
|---|---|---|---|
| `workflows/certificate.json` | Webhook `certificate.earned` | Sends certificate email on course completion | [certificate.md](workflows/certificate.md) |
| `workflows/inactivity.json` | Cron 09:00 UTC daily | Nudges students inactive for 7+ days | [inactivity.md](workflows/inactivity.md) |
| `workflows/near-completion.json` | Webhook `progress.near_completion` | Nudges students with 1-2 lessons left | [near-completion.md](workflows/near-completion.md) |

**To update a workflow:** edit in n8n UI → **⋮ menu → Download** → overwrite the JSON file → commit → `pnpm sync:n8n` on target instance.

## Architecture

```
Learnix (markLessonComplete)
  → POST /webhook/certificate.earned     (HMAC-signed)
  → POST /webhook/progress.near_completion (HMAC-signed)

n8n cron (daily)
  → GET  /api/notifications/inactive-students  (Bearer)
  → POST /api/notifications/log                (Bearer, dedup)
  → POST /api/emails/send                       (Bearer)
  → DELETE /api/notifications/log              (Bearer, rollback on failure)
```

All webhook payloads are HMAC-SHA256 signed (`X-Learnix-Signature: sha256=<hex>`). n8n verifies the signature in a Code node before processing.