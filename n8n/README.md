# n8n Lifecycle Automations

Three workflows for Learnix lifecycle emails: certificate earned, inactivity nudge (daily cron), near-completion nudge.

## Local setup

1. `pnpm dev:n8n` — starts n8n at http://localhost:5678
2. Complete owner setup in the UI.
3. **Settings → API** → enable + copy API key → add to `.env.local`:
   ```
   N8N_API_KEY=<copied key>
   N8N_API_URL=http://localhost:5678
   ```
4. Create credentials (see below).
5. **Settings → Environment Variables** → add:
   - `N8N_WEBHOOK_SECRET` = value from `.env.local`
   - `BASE_URL` = `http://host.docker.internal:3000`
6. `pnpm sync:n8n` — uploads the workflow JSONs from `n8n/workflows/`.
7. Activate all three workflows in the n8n UI.

## Credentials

Create both in **Credentials → New Credential → Header Auth**:

| Name | Header | Value |
|---|---|---|
| `learnix-api` | `Authorization` | `Bearer <N8N_API_TOKEN>` |

Credential values are **not** stored in the workflow JSONs.

## Production setup

1. Deploy with `docker-compose.n8n.prod.yml` (Postgres backend).
2. Set env vars: `N8N_DOMAIN`, `N8N_ENCRYPTION_KEY`, `N8N_DB_PASSWORD` (see `.env.n8n.example`).
3. Open the n8n HTTPS URL, create credentials and env vars with production values:
   - `N8N_WEBHOOK_SECRET` = production secret
   - `BASE_URL` = `https://yourdomain.com`
4. `N8N_API_URL=https://n8n.yourdomain.com N8N_API_KEY=<prod key> pnpm sync:n8n`
5. Activate workflows. Smoke-test with `pnpm tsx scripts/fire-test-event.ts`.

## Workflow files

| File | Trigger | Description |
|---|---|---|
| `workflows/certificate.json` | Webhook `certificate.earned` | Sends certificate email on course completion |
| `workflows/inactivity.json` | Cron 09:00 UTC daily | Nudges students inactive for 7+ days |
| `workflows/near-completion.json` | Webhook `progress.near_completion` | Nudges students with 1-2 lessons left |

**To update a workflow:** edit in n8n UI → **⋮ menu → Download** → overwrite the JSON file → commit → `pnpm sync:n8n` on target instance.

## Architecture

```
Learnix (markLessonComplete)
  → POST /webhook/certificate.earned     (HMAC-signed)
  → POST /webhook/progress.near_completion (HMAC-signed)

n8n cron (daily)
  → GET  /api/notifications/inactive-students  (Bearer)
  → POST /api/notifications/log                (Bearer, dedup)
  → POST /api/notifications/send-email         (Bearer)
  → DELETE /api/notifications/log              (Bearer, rollback on failure)
```

All webhook payloads are HMAC-SHA256 signed (`X-Learnix-Signature: sha256=<hex>`). n8n verifies the signature in a Code node before processing.