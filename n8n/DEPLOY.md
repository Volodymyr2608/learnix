# Deploying n8n to Production

This guide walks you through deploying the Learnix n8n automation server from scratch — including buying a server, setting up Docker, configuring HTTPS with Caddy, and wiring the workflows up to the production app.

**Estimated time:** 30–45 minutes.

**What you'll have at the end:**
- n8n running at `https://n8n.learnixacademy.com`
- Postgres database storing workflow state
- Caddy providing automatic HTTPS (no cert management needed)
- Three workflows active and receiving events from Learnix

---

## Table of Contents

1. [Buy a Hetzner server](#1-buy-a-hetzner-server)
2. [First login and server setup](#2-first-login-and-server-setup)
3. [Install Docker](#3-install-docker)
4. [Configure the firewall](#4-configure-the-firewall)
5. [Set up DNS](#5-set-up-dns)
6. [Copy the project to the server](#6-copy-the-project-to-the-server)
7. [Create the environment file](#7-create-the-environment-file)
8. [Start the services](#8-start-the-services)
9. [n8n first-run setup](#9-n8n-first-run-setup)
10. [Add credentials and environment variables in n8n](#10-add-credentials-and-environment-variables-in-n8n)
11. [Sync workflows from your machine](#11-sync-workflows-from-your-machine)
12. [Activate workflows](#12-activate-workflows)
13. [Update Vercel environment variables](#13-update-vercel-environment-variables)
14. [Smoke test](#14-smoke-test)
15. [Maintenance](#15-maintenance)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Buy a Hetzner server

**Hetzner CX22** (2 vCPU, 4 GB RAM, ~€4/month) is the recommended choice — it comfortably runs n8n + Postgres.

1. Go to [hetzner.com](https://hetzner.com) → **Cloud** → create an account.
2. Create a new **Project** (e.g. `learnix-infra`).
3. Before creating the server, add your SSH public key:
   - On your local machine, check if you have one: `ls ~/.ssh/id_ed25519.pub`
   - If not, generate one: `ssh-keygen -t ed25519 -C "your-email@example.com"` (press Enter for all prompts)
   - Copy it: `cat ~/.ssh/id_ed25519.pub` — copy the output
   - In Hetzner dashboard: **Security → SSH Keys → Add SSH Key** → paste it in
4. Create a server:
   - **Location**: pick the closest to your users (e.g. Nuremberg for EU)
   - **Image**: Ubuntu 24.04
   - **Type**: CX22
   - **SSH Key**: select the key you just added
   - Click **Create & Buy**
5. **Copy the server's IP address** — you'll need it for DNS and SSH.

---

## 2. First login and server setup

SSH into the server as root:

```bash
ssh root@<your-server-ip>
```

Update system packages (this may take a minute):

```bash
apt update && apt upgrade -y
```

Create a non-root user for day-to-day use:

```bash
adduser admin
usermod -aG sudo admin
```

Copy your SSH key to the new user so you can log in as them:

```bash
rsync --archive --chown=admin:admin ~/.ssh /home/admin
```

From now on, log in as `admin`:

```bash
# Exit the root session
exit

# Log back in as admin
ssh admin@<your-server-ip>
```

---

## 3. Install Docker

Docker is the only thing you need to install — it runs n8n, Postgres, and Caddy all from a single command.

```bash
# Add Docker's official GPG key and repo
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Add your user to the `docker` group so you don't need `sudo` every time:

```bash
sudo usermod -aG docker admin
```

**Log out and back in** for the group change to take effect:

```bash
exit
ssh admin@<your-server-ip>
```

Verify Docker works:

```bash
docker run hello-world
# Should print "Hello from Docker!"
```

---

## 4. Configure the firewall

Allow only SSH, HTTP (for cert issuance), and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
# Confirm with "y"

sudo ufw status
# Should show: 22, 80, 443 ALLOW
```

> Port 5678 (n8n) is intentionally **not** opened — traffic goes through Caddy on 443 only.

---

## 5. Set up DNS

You need to point `n8n.learnixacademy.com` to your server's IP. Do this in whichever registrar manages `learnixacademy.com` DNS (Namecheap, Cloudflare, GoDaddy, etc.).

Add an **A record**:

| Type | Name | Value | Proxy status | TTL |
|------|------|-------|--------------|-----|
| A | `n8n` | `<your-server-ip>` | **DNS only** (grey cloud) | Auto |

> **Important (Cloudflare users):** Make sure the proxy status is **DNS only** (grey cloud icon), not Proxied (orange cloud). If it's proxied, Caddy cannot complete the HTTPS certificate challenge because traffic hits Cloudflare instead of your server.

**DNS propagation takes 5–30 minutes.** You can check if it's ready:

```bash
# Run this from your local machine
dig n8n.learnixacademy.com +short
# Should return your server IP once propagated
```

> You can continue with steps 6–8 while waiting for DNS — Caddy will automatically obtain the HTTPS certificate once the DNS resolves.

---

## 6. Copy the project to the server

The simplest approach is to clone the repo directly on the server. You'll need a GitHub personal access token if the repo is private.

**Option A: Clone via HTTPS (private repo)**

1. On GitHub: **Settings → Developer Settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Set expiry to 90 days
   - Under **Repository access**, select your learnix repo
   - Under **Permissions → Repository → Contents**, set to **Read-only**
   - Generate and copy the token

2. On the server:

```bash
# Create a directory for the project
mkdir -p ~/apps && cd ~/apps

# Clone (replace YOUR_TOKEN and YOUR_USERNAME)
git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/learnix.git
cd learnix
```

**Option B: Clone via SSH (if you've set up deploy keys)**

```bash
mkdir -p ~/apps && cd ~/apps
git clone git@github.com:YOUR_USERNAME/learnix.git
cd learnix
```

---

## 7. Create the environment file

On the server, inside the project directory, create the `.env` file for the n8n services:

```bash
cd ~/apps/learnix
cp .env.n8n.example .env.n8n
nano .env.n8n
```

Fill in all the values. Generate secrets with `openssl rand -hex 32` for each one:

```bash
# Generate all three secrets in one go:
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "N8N_DB_PASSWORD=$(openssl rand -hex 24)"
echo "N8N_WEBHOOK_SECRET=$(openssl rand -hex 32)"
echo "N8N_API_TOKEN=$(openssl rand -hex 32)"
```

Your `.env.n8n` should look like:

```env
N8N_DOMAIN=n8n.learnixacademy.com

N8N_ENCRYPTION_KEY=<generated above>
N8N_DB_PASSWORD=<generated above>

BASE_URL=https://learnixacademy.com
N8N_WEBHOOK_BASE_URL=https://n8n.learnixacademy.com/webhook
N8N_WEBHOOK_SECRET=<generated above>
N8N_API_TOKEN=<generated above>

# Leave these blank for now — you'll fill them in after first login to n8n
N8N_API_KEY=
N8N_API_URL=https://n8n.learnixacademy.com
```

> **Keep this file safe.** Never commit it to git. It contains secrets.

---

## 8. Start the services

```bash
cd ~/apps/learnix

docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n up -d
```

This pulls the images and starts three containers: `caddy`, `n8n`, and `n8n-postgres`.

Check that everything started:

```bash
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n ps
# All three should show "running"
```

Watch the logs to confirm Caddy obtained the HTTPS certificate:

```bash
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs caddy -f
# Look for: "certificate obtained successfully"
# Press Ctrl+C to stop watching
```

> If you see `no such host` in Caddy logs, DNS hasn't propagated yet. Wait a few minutes and it will retry automatically.

---

## 9. n8n first-run setup

Open your browser and go to: **https://n8n.learnixacademy.com**

You'll see a setup screen. Fill in:
- **First name / Last name / Email**: your details
- **Password**: choose a strong password — this is your n8n admin account

Click **Get started**.

Once logged in, enable the REST API:

1. Click the **gear icon** (Settings) in the left sidebar
2. Go to **n8n API**
3. Click **Create an API key**
4. **Copy the key** — you'll need it in step 11

---

## 10. Add credentials and environment variables in n8n

### Environment variables

Environment variables are passed directly via Docker Compose — no n8n UI needed (the UI option is Enterprise-only). Make sure your `.env.n8n` has these set before starting the services:

```env
N8N_WEBHOOK_SECRET=<your-secret>
BASE_URL=https://learnixacademy.com
```

Workflows access them in Code nodes as `$env.N8N_WEBHOOK_SECRET` and `$env.BASE_URL`.

### Credentials

1. In n8n: **Credentials** (left sidebar) → **Add credential**
2. Search for **Bearer Auth** → select it
3. Fill in:
   - **Name**: `learnix-api`
   - **Token**: the `N8N_API_TOKEN` value from your `.env.n8n`
4. Click **Save**

---

## 11. Sync workflows from your machine

Back on **your local machine** (not the server), update `.env.local` with the production n8n values:

```env
# Update these in your local .env.local:
N8N_API_KEY=<the API key you copied in step 9>
N8N_API_URL=https://n8n.learnixacademy.com
N8N_WEBHOOK_BASE_URL=https://n8n.learnixacademy.com/webhook
```

Then push the workflows to the production n8n instance:

```bash
pnpm sync:n8n
```

You should see output like:
```
✓ Imported certificate workflow
✓ Imported inactivity workflow
✓ Imported near-completion workflow
```

---

## 12. Activate workflows

In the n8n UI at `https://n8n.learnixacademy.com`:

1. Go to **Workflows** in the left sidebar
2. For each of the three workflows (`certificate`, `inactivity`, `near-completion`):
   - Open the workflow
   - Toggle the **Active** switch in the top-right to **on**

All three should now show a green "Active" indicator.

---

## 13. Update Vercel environment variables

The Learnix Next.js app needs to know where to send webhook events. In the [Vercel dashboard](https://vercel.com):

1. Go to your project → **Settings → Environment Variables**
2. Add or update:

| Variable | Value |
|----------|-------|
| `N8N_WEBHOOK_BASE_URL` | `https://n8n.learnixacademy.com/webhook` |
| `N8N_WEBHOOK_SECRET` | same value as in your `.env.n8n` |
| `N8N_API_TOKEN` | same value as in your `.env.n8n` |

3. **Redeploy** the app (Vercel → Deployments → Redeploy latest) so the new env vars take effect.

---

## 14. Smoke test

From your local machine, fire a test event to verify the full flow:

```bash
pnpm tsx scripts/fire-test-event.ts
```

Then in the n8n UI → **Executions** — you should see a recent execution for the certificate or near-completion workflow. Check that it completed without errors.

---

## 15. Maintenance

### View logs

```bash
# All services
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs -f

# Just n8n
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs n8n -f

# Just Caddy (useful for HTTPS issues)
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs caddy -f
```

### Restart a service

```bash
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n restart n8n
```

### Update n8n to the latest version

```bash
cd ~/apps/learnix
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n pull
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n up -d
```

### Pull latest workflow changes from git

```bash
cd ~/apps/learnix
git pull
# Then re-sync from your local machine: pnpm sync:n8n
```

### Backup

Postgres data is stored in the Docker volume `n8n-postgres-data`. To back it up:

```bash
docker exec $(docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n ps -q n8n-postgres) \
  pg_dump -U n8n n8n > n8n-backup-$(date +%Y%m%d).sql
```

---

## 16. Troubleshooting

### HTTPS not working / browser shows "Not Secure"

DNS probably hasn't propagated yet. Check:

```bash
# From your local machine
dig n8n.learnixacademy.com +short
# Must return your server IP before Caddy can get a cert
```

Then watch Caddy logs on the server:

```bash
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs caddy -f
```

Caddy retries automatically every few minutes. Once DNS resolves, the cert is issued within seconds.

### n8n not starting

```bash
docker compose -f docker-compose.n8n.prod.yml --env-file .env.n8n logs n8n
```

Common causes:
- **`N8N_ENCRYPTION_KEY` missing or empty** — check your `.env.n8n`
- **Postgres not ready** — wait 10–15 seconds and try again; the `depends_on` healthcheck usually handles this

### Webhooks returning 401

The `N8N_WEBHOOK_SECRET` in your Vercel env vars doesn't match the one set in n8n UI → Settings → Environment Variables. Make sure both sides have the same value.

### `pnpm sync:n8n` fails with "connection refused"

`N8N_API_URL` in your local `.env.local` is wrong or n8n isn't running. Verify:

```bash
# Should return n8n version info
curl https://n8n.learnixacademy.com/api/v1/workflows \
  -H "X-N8N-API-KEY: <your-api-key>"
```

### Can't SSH into server

If you locked yourself out, use **Hetzner's rescue console**: in the Hetzner dashboard → your server → **Rescue** tab.