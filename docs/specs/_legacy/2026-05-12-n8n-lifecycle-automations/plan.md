# Plan: n8n Lifecycle Automations

## Implementation order

1. Prisma model + migration + `User.emailNotificationsEnabled`.
2. `NotificationLogRepository`.
3. JWT helpers + auth guards (Bearer for API, HMAC for webhooks, JWT for public endpoints).
4. `NotificationEmitter` (sign + retry + log).
5. Inbound routes (`inactive-students`, `log` POST/DELETE).
6. Certificate components + `CertificateService` + `/api/certificates/[enrollmentId]`.
7. Unsubscribe page + JWT-keyed flow.
8. `LessonService` hook (emit `certificate.earned` / `progress.near_completion`).
9. Local n8n via `docker-compose.n8n.yml`.
10. Three workflows + three sub-workflows in n8n; export to `n8n/workflows/*.json`.
11. `sync-n8n-workflows.ts` + `pnpm sync:n8n`.
12. Dev-only `emitTest` tRPC + `fire-test-event.ts`.
13. ADR-014 + roadmap update.

---

## Step 1 — Prisma changes

`prisma/schema/notification.prisma` (new file):

```prisma
model NotificationLog {
  id         String   @id @default(cuid())
  userId     String
  automation String
  dedupKey   String   @unique
  payload    Json
  sentAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, automation])
  @@map("notification_logs")
}
```

`prisma/schema/auth.prisma` — add to `User`:

```prisma
emailNotificationsEnabled Boolean @default(true)
notificationLogs          NotificationLog[]
```

`pnpm db:generate` creates the migration.

---

## Step 2 — Repository

`server/repositories/notificationLog.repository.ts`:

```ts
class NotificationLogRepository extends BaseRepository<"notificationLog"> {
  constructor() { super(db.notificationLog); }

  async tryLog(input: { dedupKey: string; userId: string; automation: string; payload?: unknown }) {
    try {
      const row = await db.notificationLog.create({ data: input });
      return { created: true as const, row };
    } catch (e) {
      if (isUniqueConstraintError(e)) return { created: false as const };
      throw e;
    }
  }

  async deleteByDedupKey(dedupKey: string) {
    return db.notificationLog.deleteMany({ where: { dedupKey } });
  }
}
```

The unique-constraint catch is the idempotency arbiter.

---

## Step 3 — Auth helpers

`server/services/notifications/auth.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const secret = () => new TextEncoder().encode(env.N8N_API_TOKEN);

export function signHmac(body: string) {
  return "sha256=" + createHmac("sha256", env.N8N_WEBHOOK_SECRET).update(body).digest("hex");
}

export function verifyHmac(body: string, header: string | null) {
  if (!header) return false;
  const expected = signHmac(body);
  const a = Buffer.from(expected); const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function signCertificateToken(enrollmentId: string) {
  return new SignJWT({ enrollmentId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyCertificateToken(token: string) {
  return (await jwtVerify(token, secret())).payload as { enrollmentId: string };
}

export async function signUnsubscribeToken(userId: string) {
  return new SignJWT({ userId, kind: "unsub" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secret());
}
```

Route guard for inbound API:

```ts
export function requireBearer(req: Request) {
  const h = req.headers.get("authorization");
  if (h !== `Bearer ${env.N8N_API_TOKEN}`) throw new Response("Unauthorized", { status: 401 });
}
```

---

## Step 4 — Notification emitter

`server/services/notifications/notificationEmitter.ts`:

```ts
async function postWithRetry(url: string, body: string, headers: HeadersInit) {
  const backoff = [1000, 5000, 25000];
  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", body, headers });
      if (res.ok) return { ok: true, status: res.status };
      if (attempt === backoff.length) return { ok: false, status: res.status };
    } catch (e) {
      if (attempt === backoff.length) return { ok: false, status: 0 };
    }
    await new Promise(r => setTimeout(r, backoff[attempt]));
  }
  return { ok: false, status: 0 };
}

class NotificationEmitter {
  async emit(type: "certificate.earned" | "progress.near_completion", payload: object) {
    const eventId = createId();
    const body = JSON.stringify({ eventId, type, occurredAt: new Date().toISOString(), ...payload });
    const t0 = Date.now();
    const result = await postWithRetry(
      `${env.N8N_WEBHOOK_BASE_URL}/${type}`,
      body,
      { "Content-Type": "application/json", "X-Learnix-Signature": signHmac(body) },
    );
    logger.info({ eventId, type, status: result.ok ? "sent" : "failed", latencyMs: Date.now() - t0 });
  }
}
export const notificationEmitter = new NotificationEmitter();
```

`notification.service.ts` orchestrates payload assembly:

```ts
class NotificationService {
  async fireCertificateEarned(enrollmentId: string) {
    const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
    if (!enr) return;
    const certToken = await signCertificateToken(enrollmentId);
    const unsubToken = await signUnsubscribeToken(enr.studentId);
    void notificationEmitter.emit("certificate.earned", {
      user: { id: enr.studentId, email: enr.student.email, name: enr.student.name,
              emailNotificationsEnabled: enr.student.emailNotificationsEnabled, unsubscribeToken: unsubToken },
      course: { id: enr.course.id, title: enr.course.title, slug: enr.course.slug,
                instructorName: enr.course.instructor.name },
      enrollment: { id: enr.id, completedAt: enr.completedAt },
      certificatePdfUrl: `${env.BASE_URL}/api/certificates/${enr.id}?token=${certToken}`,
    });
  }

  async fireProgressNearCompletion(studentId: string, courseId: string, progress: ProgressShape) {
    const { created } = await notificationLogRepository.tryLog({
      dedupKey: `${studentId}:near_completion:${courseId}`,
      userId: studentId,
      automation: "near_completion",
      payload: progress,
    });
    if (!created) return; // server-side guard: emit only once
    // assemble payload like fireCertificateEarned and emit
  }
}
```

---

## Step 5 — Inbound routes

`app/api/notifications/inactive-students/route.ts`:

```ts
export async function GET(req: Request) {
  requireBearer(req);
  const { searchParams } = new URL(req.url);
  const inactiveDays = Number(searchParams.get("inactiveDays") ?? 7);
  const minPct = Number(searchParams.get("minProgressPct") ?? 10);
  const maxPct = Number(searchParams.get("maxProgressPct") ?? 99);
  const dryRun = searchParams.get("dryRun") === "true";
  const students = await notificationService.findInactiveStudents({ inactiveDays, minPct, maxPct });
  return Response.json({ students, generatedAt: new Date().toISOString(), dryRun });
}
```

`findInactiveStudents` query:

```ts
async findInactiveStudents({ inactiveDays, minPct, maxPct }: Params) {
  const cutoff = subDays(new Date(), inactiveDays);
  // for each enrolled student × course where progress is between minPct/maxPct
  // and the latest LessonProgress.updatedAt < cutoff, build a row.
  // Pre-compute dedupKey: `${userId}:inactivity_7d:${courseId}:${today}`.
  return rows;
}
```

`app/api/notifications/log/route.ts`:

```ts
export async function POST(req: Request) {
  requireBearer(req);
  const body = await req.json();
  const result = await notificationLogRepository.tryLog(body);
  return Response.json({ created: result.created });
}

export async function DELETE(req: Request) {
  requireBearer(req);
  const dedupKey = new URL(req.url).searchParams.get("dedupKey");
  if (!dedupKey) return new Response("dedupKey required", { status: 400 });
  await notificationLogRepository.deleteByDedupKey(dedupKey);
  return Response.json({ deleted: true });
}
```

---

## Step 6 — Certificate

`app/_components/Certificate/CertificateDocument.tsx`:

```tsx
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { styles } from "./styles";

export function CertificateDocument(props: {
  studentName: string; courseTitle: string; instructorName: string; completedAt: Date; enrollmentId: string;
}) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <CertificateHeader />
        <CertificateBody {...props} />
        <CertificateFooter {...props} />
      </Page>
    </Document>
  );
}
```

`certificate.service.ts`:

```ts
async renderPdf(enrollmentId: string): Promise<Buffer> {
  const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
  if (!enr) throw new CertificateNotFoundError();
  if (!enr.completedAt) throw new CertificateNotCompleteError();
  return renderToBuffer(<CertificateDocument
    studentName={enr.student.name}
    courseTitle={enr.course.title}
    instructorName={enr.course.instructor.name}
    completedAt={enr.completedAt}
    enrollmentId={enr.id}
  />);
}
```

`app/api/certificates/[enrollmentId]/route.ts`:

```ts
export async function GET(req: Request, { params }: { params: { enrollmentId: string } }) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response("Unauthorized", { status: 401 });
  try { await verifyCertificateToken(token); } catch { return new Response("Unauthorized", { status: 401 }); }
  const buf = await certificateService.renderPdf(params.enrollmentId);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${params.enrollmentId}-certificate.pdf"`,
    },
  });
}
```

Map `CertificateNotFoundError` → 404, `CertificateNotCompleteError` → 409 in the route's try/catch.

---

## Step 7 — Unsubscribe

`app/unsubscribe/page.tsx` (server component):

```tsx
export default async function UnsubscribePage({ searchParams }: { searchParams: { token?: string } }) {
  if (!searchParams.token) return <UnsubscribeError />;
  try {
    const { userId } = await verifyUnsubscribeToken(searchParams.token);
    await userRepository.update(userId, { emailNotificationsEnabled: false });
    return <UnsubscribeSuccess />;
  } catch {
    return <UnsubscribeError />;
  }
}
```

---

## Step 8 — `LessonService` hook

Modify `markLessonComplete` (and `markLessonIncomplete` for symmetry — only `markLessonComplete` emits events, both invalidate the path cache):

```ts
async markLessonComplete(lessonId: string, studentId: string) {
  // existing logic that upserts LessonProgress…

  const lesson = await lessonRepository.findById(lessonId, { include: { section: true } });
  const courseId = lesson.section.courseId;

  // fire-and-forget path cache invalidation (separate spec)
  void learningPathRepository.markStale(studentId, courseId).catch(noop);

  // compute course progress
  const stats = await courseProgressService.compute(studentId, courseId);
  if (stats.percent === 100) {
    const enrollment = await enrollmentRepository.findByStudentCourse(studentId, courseId);
    void notificationService.fireCertificateEarned(enrollment.id);
  } else if (stats.lessonsRemaining === 1 || stats.lessonsRemaining === 2) {
    void notificationService.fireProgressNearCompletion(studentId, courseId, stats);
  }
}
```

---

## Step 9 — Local n8n

`docker-compose.n8n.yml`:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    ports: ["5678:5678"]
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - n8n-data:/home/node/.n8n
    extra_hosts:
      - "host.docker.internal:host-gateway"
volumes:
  n8n-data:
```

Add `dev:n8n` to `package.json`:

```json
"dev:n8n": "docker compose -f docker-compose.n8n.yml up -d"
```

Open `http://localhost:5678`, create credentials:
- `resend-api` (HTTP Header Auth: `Authorization: Bearer ${RESEND_API_KEY}`)
- `learnix-api` (HTTP Header Auth: `Authorization: Bearer ${N8N_API_TOKEN}`)

---

## Step 10 — n8n workflows

Author each workflow in the n8n UI, then "Download" → JSON into `n8n/workflows/`.

**Sub-workflows (build first):**

- `_sub_verify_hmac.json` — Function node:

  ```js
  const crypto = require("crypto");
  const expected = "sha256=" + crypto.createHmac("sha256", $env.N8N_WEBHOOK_SECRET)
    .update(JSON.stringify($json.body)).digest("hex");
  if (expected !== $json.headers["x-learnix-signature"]) {
    throw new Error("Invalid signature");
  }
  return $json.body;
  ```

- `_sub_render_email_skeleton.json` — Set node wrapping a body string with the logo + footer + unsubscribe link (`${BASE_URL}/unsubscribe?token={{ $json.user.unsubscribeToken }}`).

- `_sub_resend_send.json` — HTTP Request node to `https://api.resend.com/emails`, `On Error` branch calls `DELETE /api/notifications/log?dedupKey=...`.

**Three main workflows:** Per the diagrams in `requirements.md`. Each chains: Webhook/Cron → Verify (HMAC for webhooks) → IF emailNotificationsEnabled → POST log → IF created → Resend send → end.

Configure each webhook in n8n at:
- `/webhook/certificate.earned`
- `/webhook/progress.near_completion`

---

## Step 11 — Workflow sync

`scripts/sync-n8n-workflows.ts`:

```ts
import fs from "node:fs"; import path from "node:path";

const N8N_URL = process.env.N8N_API_URL!;
const N8N_KEY = process.env.N8N_API_KEY!;
const dir = path.join(process.cwd(), "n8n/workflows");

async function upsertWorkflow(jsonPath: string) {
  const wf = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const existing = await fetch(`${N8N_URL}/api/v1/workflows?name=${encodeURIComponent(wf.name)}`,
    { headers: { "X-N8N-API-KEY": N8N_KEY } }).then(r => r.json());
  const method = existing.data?.[0] ? "PUT" : "POST";
  const url = existing.data?.[0]
    ? `${N8N_URL}/api/v1/workflows/${existing.data[0].id}`
    : `${N8N_URL}/api/v1/workflows`;
  await fetch(url, {
    method,
    headers: { "X-N8N-API-KEY": N8N_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(wf),
  });
}

for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
  await upsertWorkflow(path.join(dir, f));
}
```

Add `sync:n8n` to `package.json`:

```json
"sync:n8n": "tsx scripts/sync-n8n-workflows.ts"
```

---

## Step 12 — Dev test helpers

`server/api/routers/notifications.ts`:

```ts
export const notificationsRouter = createTRPCRouter({
  emitTest: protectedProcedure
    .input(z.object({ type: z.enum(["certificate.earned", "progress.near_completion"]), enrollmentId: z.string() }))
    .mutation(async ({ input }) => {
      if (env.NODE_ENV !== "development") throw new TRPCError({ code: "FORBIDDEN" });
      if (input.type === "certificate.earned") return notificationService.fireCertificateEarned(input.enrollmentId);
      // assemble synthetic progress for near_completion
    }),
});
```

`scripts/fire-test-event.ts` — short CLI wrapper that calls the procedure (or directly imports the service and calls the method).

---

## Step 13 — Production rollout

1. Deploy n8n container on Railway (or Render/Fly):
   - `n8nio/n8n` image, persistent volume mounted at `/home/node/.n8n`.
   - HTTPS via platform-native cert.
   - `WEBHOOK_URL=https://n8n.<your-domain>/`.
2. Open the n8n UI, create credentials (`resend-api`, `learnix-api`).
3. From local machine: `N8N_API_URL=https://n8n.<your-domain> N8N_API_KEY=... pnpm sync:n8n`.
4. Activate the three workflows in the n8n UI.
5. Set Learnix Vercel env vars: `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`, `N8N_API_TOKEN`. Redeploy.
6. Smoke test: complete a real test course; verify the certificate email lands.

---

## Step 14 — ADR + docs

`docs/adr/014-n8n-lifecycle-automations.md`: records (a) webhooks out + REST in, (b) HMAC + Bearer + JWT split, (c) `NotificationLog` as the idempotency arbiter, (d) `@react-pdf/renderer` for the certificate, (e) self-hosted n8n.

Update `docs/specs/roadmap.md` — add Phase 12. Update `docs/README.md` to link both this spec and ADR-014.