# n8n Lifecycle Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up three lifecycle email automations (certificate, inactivity nudge, near-completion nudge) via a self-hosted n8n instance that orchestrates deduplication and scheduling while Learnix handles email rendering + delivery.

**Architecture:** Learnix fires HMAC-signed webhooks to n8n for event-driven flows; n8n's cron calls Learnix's inbound REST API for the inactivity scan. n8n checks dedup via `POST /api/notifications/log`, then delegates email sending to `POST /api/notifications/send-email` (Learnix email service + React Email). n8n rolls back the log row via `DELETE` if the send fails.

**Tech Stack:** Prisma (NotificationLog model), `jose` (JWT for certificate/unsubscribe tokens, already installed), `@react-pdf/renderer` (NEW — install), n8n REST API, Resend via existing `emailService`.

---

## Already implemented — skip these

- `User.emailNotificationsEnabled` — `prisma/schema/auth.prisma`
- `N8N_API_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` — `lib/env.js`
- `server/services/email/email.service.ts` + `email.renderer.ts` + `email.templates.ts`
- `server/services/email/unsubscribe-token.ts` — `signUnsubscribeToken`
- `app/_emails/CourseCertificateEmail.tsx`, `EngagementInactivityEmail.tsx`, `EngagementNearCompletionEmail.tsx`
- `docker-compose.n8n.yml`, `docker-compose.n8n.prod.yml`, `dev:n8n` script

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| New | `prisma/schema/notification.prisma` | `NotificationLog` model |
| Modify | `lib/env.js` | Add `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET` |
| New | `server/repositories/notificationLog.repository.ts` | `tryLog`, `deleteByDedupKey` |
| New | `server/services/notifications/auth.ts` | HMAC helpers, `requireBearer`, certificate JWT sign/verify |
| New | `server/services/notifications/notificationEmitter.ts` | HMAC-signed POST to n8n with exponential backoff retry |
| New | `server/services/notifications/notification.service.ts` | Payload assembly, `fireCertificateEarned`, `fireProgressNearCompletion`, `findInactiveStudents` |
| New | `server/services/notifications/notification.errors.ts` | `NotificationError` |
| New | `server/services/certificates/certificate.service.ts` | PDF render, certificate token sign/verify |
| New | `server/services/certificates/certificate.errors.ts` | `CertificateNotFoundError`, `CertificateNotCompleteError` |
| New | `app/_components/Certificate/CertificateDocument.tsx` | `@react-pdf/renderer` `<Document>` root |
| New | `app/_components/Certificate/components/CertificateHeader.tsx` | Logo + heading |
| New | `app/_components/Certificate/components/CertificateBody.tsx` | Student name + course title + instructor |
| New | `app/_components/Certificate/components/CertificateFooter.tsx` | Date + enrollment ID |
| New | `app/_components/Certificate/styles.ts` | react-pdf `StyleSheet` (no Tailwind) |
| New | `app/api/notifications/inactive-students/route.ts` | Bearer-guarded GET returning inactive (student, course) pairs |
| New | `app/api/notifications/log/route.ts` | POST (dedup), DELETE (rollback) |
| New | `app/api/notifications/send-email/route.ts` | Bearer-guarded POST delegating to `emailService.send()` |
| New | `app/api/certificates/[enrollmentId]/route.ts` | JWT-guarded PDF endpoint |
| Modify | `server/services/email/unsubscribe-token.ts` | Add `verifyUnsubscribeToken` |
| New | `app/unsubscribe/page.tsx` | Server component: verifies token, flips opt-out, shows result UI |
| Modify | `server/services/lesson/lesson.service.ts` | `markLessonComplete`: update enrollment progress + fire events |
| Modify | `server/repositories/enrollment.repository.ts` | Add `findByIdWithRelations` |
| New | `n8n/workflows/certificate.json` | Exported n8n workflow JSON |
| New | `n8n/workflows/inactivity.json` | Exported n8n workflow JSON |
| New | `n8n/workflows/near-completion.json` | Exported n8n workflow JSON |
| New | `n8n/README.md` | n8n setup + credentials guide |
| New | `scripts/sync-n8n-workflows.ts` | Idempotent upsert of all workflow JSONs via n8n REST API |
| New | `scripts/fire-test-event.ts` | CLI that fires a synthetic event through the real emitter |
| New | `server/api/routers/notifications.ts` | `emitTest` procedure (dev-gated) |
| Modify | `server/api/root.ts` | Register `notifications` router |
| Modify | `package.json` | Add `sync:n8n` script |
| New | `docs/adr/014-n8n-lifecycle-automations.md` | ADR |

---

## Task 1: NotificationLog Prisma model + migration

**Files:**
- Create: `prisma/schema/notification.prisma`
- Run: `pnpm db:generate`

- [ ] **Step 1: Create the schema file**

```prisma
// prisma/schema/notification.prisma
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

- [ ] **Step 2: Add the relation to User in `prisma/schema/auth.prisma`**

After the existing `welcomeEmailSentAt` line, add:

```prisma
  notificationLogs          NotificationLog[]
```

- [ ] **Step 3: Generate and apply the migration**

```bash
pnpm db:generate
# When prompted, name the migration: add_notification_logs
pnpm generate
```

Expected output: `✓ Generated Prisma Client`, migration file created in `prisma/migrations/`.

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema/notification.prisma prisma/schema/auth.prisma prisma/migrations/
git commit -m "feat(notifications): add NotificationLog prisma model"
```

---

## Task 2: Env vars — add N8N_WEBHOOK_BASE_URL and N8N_WEBHOOK_SECRET

**Files:**
- Modify: `lib/env.js`
- Modify: `.env.local` (local secret values — not committed)

- [ ] **Step 1: Add to `lib/env.js` server schema block (after `N8N_API_TOKEN`)**

```js
N8N_WEBHOOK_BASE_URL: z.string().url(),
N8N_WEBHOOK_SECRET: z.string().min(1),
```

- [ ] **Step 2: Add to `runtimeEnv` block (after `N8N_API_TOKEN`)**

```js
N8N_WEBHOOK_BASE_URL: process.env.N8N_WEBHOOK_BASE_URL,
N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
```

- [ ] **Step 3: Add values to `.env.local`**

```
N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook
N8N_WEBHOOK_SECRET=dev-webhook-secret-32chars-minimum
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add lib/env.js
git commit -m "feat(notifications): add N8N_WEBHOOK_BASE_URL and N8N_WEBHOOK_SECRET env vars"
```

---

## Task 3: NotificationLog repository

**Files:**
- Create: `server/repositories/notificationLog.repository.ts`

- [ ] **Step 1: Create the repository**

```ts
// server/repositories/notificationLog.repository.ts
import { Prisma, type NotificationLog } from "@/generated/prisma";
import { db } from "@/server/db";
import { BaseRepository } from "./base/base.repository";

class NotificationLogRepository extends BaseRepository<
	"notificationLog",
	NotificationLog,
	Prisma.NotificationLogUncheckedCreateInput,
	Prisma.NotificationLogUpdateInput,
	Prisma.NotificationLogWhereInput,
	Prisma.NotificationLogInclude,
	Prisma.NotificationLogSelect,
	Prisma.NotificationLogOrderByWithRelationInput
> {
	protected readonly modelName = "notificationLog" as const;

	async tryLog(input: {
		dedupKey: string;
		userId: string;
		automation: string;
		payload?: unknown;
	}): Promise<{ created: true; row: NotificationLog } | { created: false }> {
		try {
			const row = await db.notificationLog.create({
				data: {
					dedupKey: input.dedupKey,
					userId: input.userId,
					automation: input.automation,
					payload: (input.payload ?? {}) as Prisma.InputJsonValue,
				},
			});
			return { created: true, row };
		} catch (e) {
			if (
				e instanceof Prisma.PrismaClientKnownRequestError &&
				e.code === "P2002"
			) {
				return { created: false };
			}
			throw e;
		}
	}

	async deleteByDedupKey(dedupKey: string) {
		return db.notificationLog.deleteMany({ where: { dedupKey } });
	}
}

export const notificationLogRepository = new NotificationLogRepository();
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add server/repositories/notificationLog.repository.ts
git commit -m "feat(notifications): add NotificationLogRepository with tryLog + deleteByDedupKey"
```

---

## Task 4: Notification auth helpers

**Files:**
- Create: `server/services/notifications/auth.ts`
- Modify: `server/services/email/unsubscribe-token.ts` (add `verifyUnsubscribeToken`)

- [ ] **Step 1: Create `server/services/notifications/auth.ts`**

```ts
// server/services/notifications/auth.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

const apiSecret = () => new TextEncoder().encode(env.N8N_API_TOKEN);

export function signHmac(body: string): string {
	return (
		"sha256=" +
		createHmac("sha256", env.N8N_WEBHOOK_SECRET).update(body).digest("hex")
	);
}

export function verifyHmac(body: string, header: string | null): boolean {
	if (!header) return false;
	const expected = signHmac(body);
	const a = Buffer.from(expected);
	const b = Buffer.from(header);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function requireBearer(req: Request): void {
	const h = req.headers.get("authorization");
	if (h !== `Bearer ${env.N8N_API_TOKEN}`) {
		throw new Response("Unauthorized", { status: 401 });
	}
}

export async function signCertificateToken(enrollmentId: string): Promise<string> {
	return new SignJWT({ enrollmentId })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("30d")
		.sign(apiSecret());
}

export async function verifyCertificateToken(
	token: string,
): Promise<{ enrollmentId: string }> {
	const { payload } = await jwtVerify(token, apiSecret());
	return payload as { enrollmentId: string };
}
```

- [ ] **Step 2: Add `verifyUnsubscribeToken` to `server/services/email/unsubscribe-token.ts`**

After the existing `signUnsubscribeToken` export, add:

```ts
import { jwtVerify } from "jose";

export async function verifyUnsubscribeToken(
	token: string,
): Promise<{ userId: string }> {
	const { payload } = await jwtVerify(
		token,
		new TextEncoder().encode(env.N8N_API_TOKEN),
	);
	if (payload.kind !== "unsub") throw new Error("Invalid token kind");
	return { userId: payload.userId as string };
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add server/services/notifications/auth.ts server/services/email/unsubscribe-token.ts
git commit -m "feat(notifications): add HMAC helpers, requireBearer, certificate JWT, verifyUnsubscribeToken"
```

---

## Task 5: NotificationEmitter

**Files:**
- Create: `server/services/notifications/notificationEmitter.ts`

- [ ] **Step 1: Create the emitter**

```ts
// server/services/notifications/notificationEmitter.ts
import { env } from "@/lib/env";
import { logger } from "@/server/utils/logger";
import { signHmac } from "./auth";

type EventType = "certificate.earned" | "progress.near_completion";

const BACKOFF_MS = [1000, 5000, 25000] as const;

async function postWithRetry(
	url: string,
	body: string,
	headers: Record<string, string>,
): Promise<{ ok: boolean; status: number }> {
	for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
		}
		try {
			const res = await fetch(url, { method: "POST", body, headers });
			if (res.ok) return { ok: true, status: res.status };
			if (attempt === BACKOFF_MS.length) return { ok: false, status: res.status };
		} catch {
			if (attempt === BACKOFF_MS.length) return { ok: false, status: 0 };
		}
	}
	return { ok: false, status: 0 };
}

class NotificationEmitter {
	async emit(type: EventType, payload: object): Promise<void> {
		const eventId = crypto.randomUUID();
		const body = JSON.stringify({
			eventId,
			type,
			occurredAt: new Date().toISOString(),
			...payload,
		});
		const t0 = Date.now();
		const result = await postWithRetry(
			`${env.N8N_WEBHOOK_BASE_URL}/${type}`,
			body,
			{
				"Content-Type": "application/json",
				"X-Learnix-Signature": signHmac(body),
			},
		);
		logger.info("notification_emitter", {
			eventId,
			type,
			status: result.ok ? "sent" : "failed",
			latencyMs: Date.now() - t0,
		});
	}
}

export const notificationEmitter = new NotificationEmitter();
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add server/services/notifications/notificationEmitter.ts
git commit -m "feat(notifications): add NotificationEmitter with HMAC signing and exponential backoff"
```

---

## Task 6: Notification errors + NotificationService

**Files:**
- Create: `server/services/notifications/notification.errors.ts`
- Create: `server/services/notifications/notification.service.ts`
- Modify: `server/repositories/enrollment.repository.ts` (add `findByIdWithRelations`)

- [ ] **Step 1: Create errors file**

```ts
// server/services/notifications/notification.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class NotificationError extends DomainError {}
```

- [ ] **Step 2: Add `findByIdWithRelations` to enrollment repository**

In `server/repositories/enrollment.repository.ts`, after `findByStudentCourse`:

```ts
findByIdWithRelations(enrollmentId: string) {
	return this.findFirst({
		where: { id: enrollmentId },
		include: {
			student: {
				select: {
					id: true,
					email: true,
					name: true,
					emailNotificationsEnabled: true,
				},
			},
			course: {
				include: {
					instructor: { select: { name: true } },
				},
			},
		},
	});
}
```

- [ ] **Step 3: Create `server/services/notifications/notification.service.ts`**

```ts
// server/services/notifications/notification.service.ts
import { EnrollmentStatus } from "@/generated/prisma";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { signCertificateToken } from "@/server/services/notifications/auth";
import { signUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { notificationEmitter } from "./notificationEmitter";
import { format, subDays } from "date-fns";

export type InactiveStudentItem = {
	userId: string;
	email: string;
	name: string;
	emailNotificationsEnabled: boolean;
	courseId: string;
	courseTitle: string;
	courseSlug: string;
	progressPct: number;
	nextLessonTitle: string;
	resumeUrl: string;
	lastActivityAt: string;
	dedupKey: string;
};

class NotificationService {
	async fireCertificateEarned(enrollmentId: string): Promise<void> {
		const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
		if (!enr) return;

		const [certToken, unsubToken] = await Promise.all([
			signCertificateToken(enrollmentId),
			signUnsubscribeToken(enr.studentId),
		]);

		void notificationEmitter.emit("certificate.earned", {
			user: {
				id: enr.studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				unsubscribeToken: unsubToken,
			},
			course: {
				id: enr.courseId,
				title: enr.course.title,
				slug: enr.course.slug,
				instructorName: enr.course.instructor.name,
			},
			enrollment: {
				id: enr.id,
				completedAt: enr.completedAt?.toISOString(),
			},
			certificatePdfUrl: `${env.BASE_URL}/api/certificates/${enrollmentId}?token=${certToken}`,
			unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
		});
	}

	async fireProgressNearCompletion(
		studentId: string,
		courseId: string,
		progress: {
			completedLessons: number;
			totalLessons: number;
			lessonsRemaining: number;
			nextLessonId: string | null;
			nextLessonTitle: string;
		},
	): Promise<void> {
		const dedupKey = `${studentId}:near_completion:${courseId}`;
		const { created } = await notificationLogRepository.tryLog({
			dedupKey,
			userId: studentId,
			automation: "near_completion",
			payload: progress,
		});
		if (!created) return;

		const enr = await enrollmentRepository.findFirst({
			where: { studentId, courseId },
			include: {
				student: { select: { email: true, name: true, emailNotificationsEnabled: true } },
				course: { select: { title: true, slug: true } },
			},
		});
		if (!enr) return;

		const unsubToken = await signUnsubscribeToken(studentId);
		const nextLessonUrl = progress.nextLessonId
			? `${env.BASE_URL}/dashboard/courses/${enr.course.slug}/lessons/${progress.nextLessonId}`
			: `${env.BASE_URL}/dashboard/courses/${enr.course.slug}`;

		void notificationEmitter.emit("progress.near_completion", {
			user: {
				id: studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				unsubscribeToken: unsubToken,
			},
			course: { id: courseId, title: enr.course.title, slug: enr.course.slug },
			progress: { ...progress, nextLessonUrl },
			unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
		});
	}

	async findInactiveStudents(params: {
		inactiveDays: number;
		minPct: number;
		maxPct: number;
	}): Promise<InactiveStudentItem[]> {
		const cutoff = subDays(new Date(), params.inactiveDays);
		const today = format(new Date(), "yyyy-MM-dd");

		const enrollments = await db.enrollment.findMany({
			where: {
				status: { in: [EnrollmentStatus.active, EnrollmentStatus.completed] },
				course: { deletedAt: null, status: "published" },
			},
			include: {
				student: {
					select: {
						id: true,
						email: true,
						name: true,
						emailNotificationsEnabled: true,
					},
				},
				course: {
					select: {
						id: true,
						title: true,
						slug: true,
						sections: {
							where: { deletedAt: null },
							orderBy: { order: "asc" },
							include: {
								lessons: {
									where: { deletedAt: null },
									orderBy: { order: "asc" },
									select: { id: true, title: true },
								},
							},
						},
					},
				},
			},
		});

		const results: InactiveStudentItem[] = [];

		for (const enr of enrollments) {
			const allLessons = enr.course.sections.flatMap((s) => s.lessons);
			const totalLessons = allLessons.length;
			if (totalLessons === 0) continue;

			const progresses = await db.lessonProgress.findMany({
				where: {
					studentId: enr.studentId,
					lessonId: { in: allLessons.map((l) => l.id) },
					isCompleted: true,
				},
				orderBy: { updatedAt: "desc" },
				select: { lessonId: true, updatedAt: true },
			});

			if (progresses.length === 0) continue;

			const progressPct = Math.round(
				(progresses.length / totalLessons) * 100,
			);
			if (progressPct < params.minPct || progressPct > params.maxPct) continue;

			const latestActivityAt = progresses[0].updatedAt;
			if (latestActivityAt >= cutoff) continue;

			const completedIds = new Set(progresses.map((p) => p.lessonId));
			const nextLesson = allLessons.find((l) => !completedIds.has(l.id));

			const resumeUrl = nextLesson
				? `${env.BASE_URL}/dashboard/courses/${enr.course.slug}/lessons/${nextLesson.id}`
				: `${env.BASE_URL}/dashboard/courses/${enr.course.slug}`;

			results.push({
				userId: enr.studentId,
				email: enr.student.email,
				name: enr.student.name,
				emailNotificationsEnabled: enr.student.emailNotificationsEnabled,
				courseId: enr.courseId,
				courseTitle: enr.course.title,
				courseSlug: enr.course.slug,
				progressPct,
				nextLessonTitle: nextLesson?.title ?? "",
				resumeUrl,
				lastActivityAt: latestActivityAt.toISOString(),
				dedupKey: `${enr.studentId}:inactivity_7d:${enr.courseId}:${today}`,
			});
		}

		return results;
	}
}

export const notificationService = new NotificationService();
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors. If Prisma doesn't have `.order` on sections/lessons, replace `orderBy: { order: "asc" }` with `orderBy: { id: "asc" }`.

- [ ] **Step 5: Commit**

```bash
git add server/services/notifications/ server/repositories/enrollment.repository.ts
git commit -m "feat(notifications): add NotificationService with fireCertificateEarned, fireProgressNearCompletion, findInactiveStudents"
```

---

## Task 7: Inbound API routes

**Files:**
- Create: `app/api/notifications/inactive-students/route.ts`
- Create: `app/api/notifications/log/route.ts`
- Create: `app/api/notifications/send-email/route.ts`

- [ ] **Step 1: Create `app/api/notifications/inactive-students/route.ts`**

```ts
// app/api/notifications/inactive-students/route.ts
import { requireBearer } from "@/server/services/notifications/auth";
import { notificationService } from "@/server/services/notifications/notification.service";

export async function GET(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const { searchParams } = new URL(req.url);
	const inactiveDays = Number(searchParams.get("inactiveDays") ?? 7);
	const minPct = Number(searchParams.get("minProgressPct") ?? 10);
	const maxPct = Number(searchParams.get("maxProgressPct") ?? 99);

	const items = await notificationService.findInactiveStudents({
		inactiveDays,
		minPct,
		maxPct,
	});

	return Response.json({ items, generatedAt: new Date().toISOString() });
}
```

- [ ] **Step 2: Create `app/api/notifications/log/route.ts`**

```ts
// app/api/notifications/log/route.ts
import { requireBearer } from "@/server/services/notifications/auth";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const body = await req.json();
	const result = await notificationLogRepository.tryLog(body);
	return Response.json({ created: result.created });
}

export async function DELETE(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const dedupKey = new URL(req.url).searchParams.get("dedupKey");
	if (!dedupKey) {
		return new Response("dedupKey required", { status: 400 });
	}
	await notificationLogRepository.deleteByDedupKey(dedupKey);
	return Response.json({ deleted: true });
}
```

- [ ] **Step 3: Create `app/api/notifications/send-email/route.ts`**

```ts
// app/api/notifications/send-email/route.ts
import { requireBearer } from "@/server/services/notifications/auth";
import { emailService } from "@/server/services/email/email.service";
import type { TemplateKey } from "@/server/services/email/email.templates";

export async function POST(req: Request) {
	try {
		requireBearer(req);
	} catch (res) {
		return res as Response;
	}

	const body = await req.json() as {
		templateKey: TemplateKey;
		toEmail: string;
		userId?: string;
		payload: unknown;
	};

	const result = await emailService.send({
		templateKey: body.templateKey,
		toEmail: body.toEmail,
		userId: body.userId,
		payload: body.payload,
	});

	if ("skipped" in result) {
		return Response.json({ skipped: result.skipped });
	}
	return Response.json({ id: result.id });
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add app/api/notifications/
git commit -m "feat(notifications): add inbound API routes (inactive-students, log, send-email)"
```

---

## Task 8: Install @react-pdf/renderer + Certificate components + CertificateService

**Files:**
- Install: `@react-pdf/renderer`
- Create: `app/_components/Certificate/CertificateDocument.tsx`
- Create: `app/_components/Certificate/components/CertificateHeader.tsx`
- Create: `app/_components/Certificate/components/CertificateBody.tsx`
- Create: `app/_components/Certificate/components/CertificateFooter.tsx`
- Create: `app/_components/Certificate/styles.ts`
- Create: `server/services/certificates/certificate.errors.ts`
- Create: `server/services/certificates/certificate.service.ts`

- [ ] **Step 1: Install the package**

```bash
pnpm add @react-pdf/renderer
```

- [ ] **Step 2: Create `app/_components/Certificate/styles.ts`**

```ts
// app/_components/Certificate/styles.ts
import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#ffffff",
		padding: 60,
		fontFamily: "Helvetica",
	},
	header: {
		alignItems: "center",
		marginBottom: 40,
	},
	headerTitle: {
		fontSize: 28,
		fontWeight: "bold",
		color: "#111827",
		textTransform: "uppercase",
		letterSpacing: 4,
	},
	headerSubtitle: {
		fontSize: 14,
		color: "#6B7280",
		marginTop: 4,
	},
	body: {
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
	},
	bodyPresented: {
		fontSize: 14,
		color: "#6B7280",
		marginBottom: 8,
	},
	bodyName: {
		fontSize: 36,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		marginBottom: 12,
	},
	bodyCompleted: {
		fontSize: 14,
		color: "#6B7280",
		marginBottom: 8,
	},
	bodyCourseTitle: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: "#4F46E5",
		textAlign: "center",
	},
	bodyInstructor: {
		fontSize: 13,
		color: "#6B7280",
		marginTop: 10,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 40,
		paddingTop: 20,
		borderTop: "1px solid #E5E7EB",
	},
	footerText: {
		fontSize: 11,
		color: "#9CA3AF",
	},
});
```

- [ ] **Step 3: Create `app/_components/Certificate/components/CertificateHeader.tsx`**

```tsx
// app/_components/Certificate/components/CertificateHeader.tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

export function CertificateHeader() {
	return (
		<View style={styles.header}>
			<Text style={styles.headerTitle}>Certificate of Completion</Text>
			<Text style={styles.headerSubtitle}>Learnix</Text>
		</View>
	);
}
```

- [ ] **Step 4: Create `app/_components/Certificate/components/CertificateBody.tsx`**

```tsx
// app/_components/Certificate/components/CertificateBody.tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

type Props = {
	studentName: string;
	courseTitle: string;
	instructorName: string;
};

export function CertificateBody({ studentName, courseTitle, instructorName }: Props) {
	return (
		<View style={styles.body}>
			<Text style={styles.bodyPresented}>This certifies that</Text>
			<Text style={styles.bodyName}>{studentName}</Text>
			<Text style={styles.bodyCompleted}>has successfully completed</Text>
			<Text style={styles.bodyCourseTitle}>{courseTitle}</Text>
			<Text style={styles.bodyInstructor}>Instructor: {instructorName}</Text>
		</View>
	);
}
```

- [ ] **Step 5: Create `app/_components/Certificate/components/CertificateFooter.tsx`**

```tsx
// app/_components/Certificate/components/CertificateFooter.tsx
import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

type Props = {
	completedAt: Date;
	enrollmentId: string;
};

export function CertificateFooter({ completedAt, enrollmentId }: Props) {
	const dateStr = completedAt.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return (
		<View style={styles.footer}>
			<Text style={styles.footerText}>Issued: {dateStr}</Text>
			<Text style={styles.footerText}>ID: {enrollmentId}</Text>
		</View>
	);
}
```

- [ ] **Step 6: Create `app/_components/Certificate/CertificateDocument.tsx`**

```tsx
// app/_components/Certificate/CertificateDocument.tsx
import { Document, Page } from "@react-pdf/renderer";
import { CertificateBody } from "./components/CertificateBody";
import { CertificateFooter } from "./components/CertificateFooter";
import { CertificateHeader } from "./components/CertificateHeader";
import { styles } from "./styles";

export type CertificateProps = {
	studentName: string;
	courseTitle: string;
	instructorName: string;
	completedAt: Date;
	enrollmentId: string;
};

export function CertificateDocument(props: CertificateProps) {
	return (
		<Document>
			<Page size="A4" orientation="landscape" style={styles.page}>
				<CertificateHeader />
				<CertificateBody
					studentName={props.studentName}
					courseTitle={props.courseTitle}
					instructorName={props.instructorName}
				/>
				<CertificateFooter
					completedAt={props.completedAt}
					enrollmentId={props.enrollmentId}
				/>
			</Page>
		</Document>
	);
}
```

- [ ] **Step 7: Create `server/services/certificates/certificate.errors.ts`**

```ts
// server/services/certificates/certificate.errors.ts
import { DomainError } from "@/server/services/base/base.errors";

export class CertificateNotFoundError extends DomainError {
	constructor() {
		super("Enrollment not found", "NOT_FOUND");
	}
}

export class CertificateNotCompleteError extends DomainError {
	constructor() {
		super("Course not yet completed", "CONFLICT");
	}
}
```

- [ ] **Step 8: Create `server/services/certificates/certificate.service.ts`**

```ts
// server/services/certificates/certificate.service.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { CertificateDocument } from "@/app/_components/Certificate/CertificateDocument";
import {
	CertificateNotCompleteError,
	CertificateNotFoundError,
} from "./certificate.errors";

class CertificateService {
	async renderPdf(enrollmentId: string): Promise<Buffer> {
		const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
		if (!enr) throw new CertificateNotFoundError();
		if (!enr.completedAt) throw new CertificateNotCompleteError();

		const element = createElement(CertificateDocument, {
			studentName: enr.student.name,
			courseTitle: enr.course.title,
			instructorName: enr.course.instructor.name,
			completedAt: enr.completedAt,
			enrollmentId: enr.id,
		});

		return renderToBuffer(element) as Promise<Buffer>;
	}
}

export const certificateService = new CertificateService();
```

- [ ] **Step 9: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 10: Commit**

```bash
git add app/_components/Certificate/ server/services/certificates/
git commit -m "feat(certificates): add CertificateDocument PDF components and CertificateService"
```

---

## Task 9: Certificate API route

**Files:**
- Create: `app/api/certificates/[enrollmentId]/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/certificates/[enrollmentId]/route.ts
import {
	CertificateNotCompleteError,
	CertificateNotFoundError,
} from "@/server/services/certificates/certificate.errors";
import { certificateService } from "@/server/services/certificates/certificate.service";
import { verifyCertificateToken } from "@/server/services/notifications/auth";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ enrollmentId: string }> },
) {
	const { enrollmentId } = await params;
	const token = new URL(req.url).searchParams.get("token");

	if (!token) {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const claims = await verifyCertificateToken(token);
		if (claims.enrollmentId !== enrollmentId) {
			return new Response("Unauthorized", { status: 401 });
		}
	} catch {
		return new Response("Unauthorized", { status: 401 });
	}

	try {
		const buf = await certificateService.renderPdf(enrollmentId);
		return new Response(buf, {
			headers: {
				"Content-Type": "application/pdf",
				"Content-Disposition": `attachment; filename="${enrollmentId}-certificate.pdf"`,
			},
		});
	} catch (e) {
		if (e instanceof CertificateNotFoundError) {
			return new Response("Not found", { status: 404 });
		}
		if (e instanceof CertificateNotCompleteError) {
			return new Response("Course not completed", { status: 409 });
		}
		throw e;
	}
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add app/api/certificates/
git commit -m "feat(certificates): add /api/certificates/[enrollmentId] route with JWT auth"
```

---

## Task 10: Unsubscribe page

**Files:**
- Create: `app/unsubscribe/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/unsubscribe/page.tsx
import { verifyUnsubscribeToken } from "@/server/services/email/unsubscribe-token";
import { userRepository } from "@/server/repositories/user.repository";

export default async function UnsubscribePage({
	searchParams,
}: {
	searchParams: Promise<{ token?: string }>;
}) {
	const { token } = await searchParams;

	if (!token) {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="text-2xl font-bold text-gray-900">Invalid link</h1>
					<p className="mt-2 text-gray-600">
						This unsubscribe link is invalid or has expired.
					</p>
				</div>
			</main>
		);
	}

	try {
		const { userId } = await verifyUnsubscribeToken(token);
		await userRepository.update(userId, { emailNotificationsEnabled: false });

		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="text-2xl font-bold text-gray-900">
						You&apos;ve been unsubscribed
					</h1>
					<p className="mt-2 text-gray-600">
						You will no longer receive notification emails from Learnix.
					</p>
				</div>
			</main>
		);
	} catch {
		return (
			<main className="flex min-h-screen items-center justify-center p-8">
				<div className="max-w-md text-center">
					<h1 className="text-2xl font-bold text-gray-900">Invalid link</h1>
					<p className="mt-2 text-gray-600">
						This unsubscribe link is invalid or has expired.
					</p>
				</div>
			</main>
		);
	}
}
```

- [ ] **Step 2: Check `userRepository.update` supports `emailNotificationsEnabled`**

```bash
grep -n "emailNotificationsEnabled" /home/volodymyr/job/pet-projects/t3-stack/learnix/server/repositories/user.repository.ts
```

If not present, `Prisma.UserUpdateInput` already includes this field via the generated types — no change needed.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add app/unsubscribe/
git commit -m "feat(notifications): add /unsubscribe page with JWT token verification"
```

---

## Task 11: LessonService hook — update progress + fire events on markLessonComplete

**Files:**
- Modify: `server/services/lesson/lesson.service.ts`

- [ ] **Step 1: Add imports at the top of `lesson.service.ts`**

After the existing imports, add:

```ts
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { notificationService } from "@/server/services/notifications/notification.service";
import { db } from "@/server/db";
```

(`db` is already imported; skip that line if so.)

- [ ] **Step 2: Replace `markLessonComplete` body**

The current `markLessonComplete` (lines 148-171) ends with `this.markStaleForLesson`. Replace with:

```ts
async markLessonComplete(lessonId: string, studentId: string) {
	try {
		await this.getStudentLesson(lessonId, studentId);
		await db.lessonProgress.upsert({
			where: { lessonId_studentId: { lessonId, studentId } },
			create: { lessonId, studentId, isCompleted: true, completedAt: new Date() },
			update: { isCompleted: true, completedAt: new Date() },
		});
		this.markStaleForLesson(lessonId, studentId);
		void this.syncProgressAndFireEvents(lessonId, studentId);
	} catch (error) {
		if (error instanceof LessonError) throw error;
		throw new LessonError(
			"Failed to mark lesson complete",
			"INTERNAL_SERVER_ERROR",
			error,
			{ lessonId },
		);
	}
}
```

- [ ] **Step 3: Add the `syncProgressAndFireEvents` private method to `LessonService`**

Add after `markStaleForLesson`:

```ts
private async syncProgressAndFireEvents(
	lessonId: string,
	studentId: string,
): Promise<void> {
	try {
		const lessonWithSection = await lessonRepository.findFirst({
			where: { id: lessonId, deletedAt: null },
			select: { section: { select: { courseId: true } } },
		});
		const courseId = lessonWithSection?.section?.courseId;
		if (!courseId) return;

		const [totalLessons, completedLessons] = await Promise.all([
			db.lesson.count({ where: { section: { courseId }, deletedAt: null } }),
			db.lessonProgress.count({
				where: {
					studentId,
					isCompleted: true,
					lesson: { section: { courseId }, deletedAt: null },
				},
			}),
		]);

		if (totalLessons === 0) return;

		const progressPct = Math.round((completedLessons / totalLessons) * 100);
		const lessonsRemaining = totalLessons - completedLessons;

		// Update enrollment.progress
		const enrollment = await enrollmentRepository.findFirst({
			where: { studentId, courseId },
		});
		if (!enrollment) return;

		if (progressPct === 100) {
			await enrollmentRepository.update(enrollment.id, {
				progress: 100,
				completedAt: enrollment.completedAt ?? new Date(),
				status: "completed",
			});
			void notificationService
				.fireCertificateEarned(enrollment.id)
				.catch((err) => logger.warn("fireCertificateEarned failed:", err));
		} else {
			await enrollmentRepository.update(enrollment.id, { progress: progressPct });

			if (lessonsRemaining === 1 || lessonsRemaining === 2) {
				const nextLesson = await lessonRepository.findFirst({
					where: {
						section: { courseId },
						deletedAt: null,
						id: {
							notIn: await db.lessonProgress
								.findMany({
									where: { studentId, isCompleted: true, lesson: { section: { courseId } } },
									select: { lessonId: true },
								})
								.then((rows) => rows.map((r) => r.lessonId)),
						},
					},
					select: { id: true, title: true },
				});

				void notificationService
					.fireProgressNearCompletion(studentId, courseId, {
						completedLessons,
						totalLessons,
						lessonsRemaining,
						nextLessonId: nextLesson?.id ?? null,
						nextLessonTitle: nextLesson?.title ?? "",
					})
					.catch((err) =>
						logger.warn("fireProgressNearCompletion failed:", err),
					);
			}
		}
	} catch (err) {
		logger.warn("syncProgressAndFireEvents failed:", err);
	}
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add server/services/lesson/lesson.service.ts
git commit -m "feat(notifications): wire markLessonComplete to sync enrollment progress and fire lifecycle events"
```

---

## Task 12: n8n workflow setup, workflow JSON files, and sync script

**Files:**
- Create: `n8n/workflows/` (workflow JSONs exported from n8n UI)
- Create: `n8n/README.md`
- Create: `scripts/sync-n8n-workflows.ts`
- Modify: `package.json`

### 12a: Start n8n and configure credentials

- [ ] **Step 1: Start n8n**

```bash
pnpm dev:n8n
```

Open `http://localhost:5678`. Complete the owner setup (email + password).

- [ ] **Step 2: Enable the n8n REST API**

Go to **Settings → API** → enable API → copy the API key.

Add to `.env.local`:
```
N8N_API_KEY=<copied key>
N8N_API_URL=http://localhost:5678
```

- [ ] **Step 3: Create credentials in n8n UI**

Go to **Credentials** → **New Credential**:

1. **learnix-api**: Type `Header Auth` → Name `Authorization`, Value `Bearer <your N8N_API_TOKEN from .env.local>`.
2. **resend-api**: Type `Header Auth` → Name `Authorization`, Value `Bearer <your RESEND_API_KEY>`.

### 12b: Create the three workflows in n8n UI

Build each workflow in the n8n UI. After building, go to the workflow → **⋮ menu → Download** → save the JSON.

#### Certificate workflow (`n8n/workflows/certificate.json`)

In n8n: **Workflows → New → Add nodes** in this order:

1. **Webhook** node: Path = `certificate.earned`, Method = POST, Respond = Immediately.
2. **Code** node (JavaScript): Verifies HMAC.

   ```js
   const crypto = require("crypto");
   const body = JSON.stringify($input.first().json);
   const sig = $input.first().headers["x-learnix-signature"];
   const expected = "sha256=" + crypto
     .createHmac("sha256", $env.N8N_WEBHOOK_SECRET)
     .update(body)
     .digest("hex");
   if (expected !== sig) throw new Error("Invalid HMAC signature");
   return $input.all();
   ```

3. **IF** node: Condition `{{ $json.user.emailNotificationsEnabled }}` is `true`.
4. **HTTP Request** node: POST `{{ $env.BASE_URL }}/api/notifications/log`
   - Auth: Credential `learnix-api` (Header Auth)
   - Body (JSON): `{ "dedupKey": "{{ $json.user.id }}:certificate:{{ $json.enrollment.id }}", "userId": "{{ $json.user.id }}", "automation": "certificate", "payload": {{ $json }} }`
5. **IF** node: Condition `{{ $json.created }}` is `true`.
6. **HTTP Request** node: POST `{{ $env.BASE_URL }}/api/notifications/send-email`
   - Auth: Credential `learnix-api` (Header Auth)
   - Body (JSON):
     ```json
     {
       "templateKey": "course.certificate",
       "toEmail": "{{ $('Webhook').item.json.user.email }}",
       "userId": "{{ $('Webhook').item.json.user.id }}",
       "payload": {
         "studentName": "{{ $('Webhook').item.json.user.name }}",
         "courseTitle": "{{ $('Webhook').item.json.course.title }}",
         "instructorName": "{{ $('Webhook').item.json.course.instructorName }}",
         "certificatePdfUrl": "{{ $('Webhook').item.json.certificatePdfUrl }}",
         "unsubscribeUrl": "{{ $('Webhook').item.json.unsubscribeUrl }}"
       }
     }
     ```
7. **HTTP Request** node (Error branch of step 6): DELETE `{{ $env.BASE_URL }}/api/notifications/log?dedupKey={{ $('HTTP Request (log)').item.json.dedupKey }}`
   - Auth: Credential `learnix-api`

Wire the error output of the send node to the DELETE (rollback) node.

#### Near-completion workflow (`n8n/workflows/near-completion.json`)

Same structure as certificate, with:
- Webhook path: `progress.near_completion`
- dedupKey: `{{ $json.user.id }}:near_completion:{{ $json.course.id }}`
- automation: `near_completion`
- templateKey: `engagement.near-completion`
- payload fields: `studentName`, `courseTitle`, `lessonsRemaining`, `nextLessonUrl`, `unsubscribeUrl`

#### Inactivity workflow (`n8n/workflows/inactivity.json`)

Nodes:
1. **Cron** node: Every day at 09:00 UTC.
2. **HTTP Request** node: GET `{{ $env.BASE_URL }}/api/notifications/inactive-students?inactiveDays=7&minProgressPct=10&maxProgressPct=99`
   - Auth: Credential `learnix-api`
3. **Split In Batches** node: Batch size 50, field `items`.
4. **IF** node: `{{ $json.emailNotificationsEnabled }}` is `true`.
5. **HTTP Request** node: POST `{{ $env.BASE_URL }}/api/notifications/log`
   - Body: `{ "dedupKey": "{{ $json.dedupKey }}", "userId": "{{ $json.userId }}", "automation": "inactivity_7d", "payload": {{ $json }} }`
6. **IF** node: `{{ $json.created }}` is `true`.
7. **HTTP Request** node: POST `{{ $env.BASE_URL }}/api/notifications/send-email`
   - Body: `{ "templateKey": "engagement.inactivity-7d", "toEmail": "{{ $('Split In Batches').item.json.email }}", "userId": "{{ $('Split In Batches').item.json.userId }}", "payload": { "studentName": "{{ ... }}", "courseTitle": "{{ ... }}", "nextLessonTitle": "{{ ... }}", "resumeUrl": "{{ ... }}", "progressPct": {{ ... }}, "unsubscribeUrl": "{{ ... }}" } }`
8. **HTTP Request** (error branch): DELETE log (rollback).

Activate all three workflows. Download each as JSON and save to `n8n/workflows/`.

### 12c: Add n8n environment variables to n8n

In n8n → **Settings → Environment Variables**, add:
- `N8N_WEBHOOK_SECRET` = the value from your `.env.local`
- `BASE_URL` = `http://host.docker.internal:3000` (local) or your production URL

### 12d: Sync script + n8n README

- [ ] **Step 1: Create `scripts/sync-n8n-workflows.ts`**

```ts
// scripts/sync-n8n-workflows.ts
import fs from "node:fs";
import path from "node:path";

const N8N_URL = process.env.N8N_API_URL;
const N8N_KEY = process.env.N8N_API_KEY;

if (!N8N_URL || !N8N_KEY) {
	console.error("N8N_API_URL and N8N_API_KEY must be set");
	process.exit(1);
}

const dir = path.join(process.cwd(), "n8n/workflows");

async function upsertWorkflow(jsonPath: string) {
	const wf = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const listRes = await fetch(
		`${N8N_URL}/api/v1/workflows?name=${encodeURIComponent(wf.name)}`,
		{ headers: { "X-N8N-API-KEY": N8N_KEY! } },
	);
	const list = await listRes.json() as { data?: { id: string }[] };
	const existing = list.data?.[0];

	const method = existing ? "PUT" : "POST";
	const url = existing
		? `${N8N_URL}/api/v1/workflows/${existing.id}`
		: `${N8N_URL}/api/v1/workflows`;

	const res = await fetch(url, {
		method,
		headers: {
			"X-N8N-API-KEY": N8N_KEY!,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(wf),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Failed to upsert ${path.basename(jsonPath)}: ${text}`);
	}

	console.log(`✓ ${path.basename(jsonPath)} (${method})`);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
for (const f of files) {
	await upsertWorkflow(path.join(dir, f));
}
console.log("Done.");
```

- [ ] **Step 2: Add `sync:n8n` to `package.json`**

In the `scripts` block, after `dev:n8n:down`:

```json
"sync:n8n": "tsx scripts/sync-n8n-workflows.ts"
```

- [ ] **Step 3: Create `n8n/README.md`**

```markdown
# n8n Lifecycle Automations

Three workflows for Learnix lifecycle emails: certificate, inactivity nudge, near-completion.

## Local setup

1. `pnpm dev:n8n` — starts n8n at http://localhost:5678
2. Complete owner setup in the UI.
3. **Settings → API** → enable + copy API key → add `N8N_API_KEY` and `N8N_API_URL=http://localhost:5678` to `.env.local`.
4. Create credentials (see below).
5. **Settings → Environment Variables** → add `N8N_WEBHOOK_SECRET` and `BASE_URL=http://host.docker.internal:3000`.
6. `pnpm sync:n8n` to upload the workflow JSONs.
7. Activate all three workflows in the n8n UI.

## Credentials

Create both in **Credentials → New Credential → Header Auth**:

| Name | Header | Value |
|---|---|---|
| `learnix-api` | `Authorization` | `Bearer <N8N_API_TOKEN>` |
| `resend-api` | `Authorization` | `Bearer <RESEND_API_KEY>` |

Credential values are **not** stored in the workflow JSONs.

## Production setup

1. Deploy with `docker-compose.n8n.prod.yml` (Postgres backend).
2. Set env vars: `N8N_DOMAIN`, `N8N_ENCRYPTION_KEY`, `N8N_DB_PASSWORD` (see `.env.n8n.example`).
3. Open n8n HTTPS URL, create credentials and env vars as above, but with production values.
4. `N8N_API_URL=https://n8n.yourdomain.com N8N_API_KEY=<prod key> pnpm sync:n8n`.
5. Activate workflows. Smoke-test with `pnpm tsx scripts/fire-test-event.ts certificate.earned <enrollmentId>`.

## Workflow files

| File | Description |
|---|---|
| `workflows/certificate.json` | Webhook-driven certificate email |
| `workflows/inactivity.json` | Daily cron inactivity nudge |
| `workflows/near-completion.json` | Webhook-driven near-completion nudge |

**Workflow JSONs are exported from the n8n UI.** To update: edit in n8n → Download → overwrite the JSON → commit → `pnpm sync:n8n` on target instance.
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add n8n/ scripts/sync-n8n-workflows.ts package.json
git commit -m "feat(n8n): add workflow JSONs, sync script, n8n README"
```

---

## Task 13: Dev helpers — emitTest tRPC + fire-test-event CLI

**Files:**
- Create: `server/api/routers/notifications.ts`
- Modify: `server/api/root.ts`
- Create: `scripts/fire-test-event.ts`

- [ ] **Step 1: Create `server/api/routers/notifications.ts`**

```ts
// server/api/routers/notifications.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { notificationService } from "@/server/services/notifications/notification.service";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
	emitTest: protectedProcedure
		.input(
			z.object({
				type: z.enum(["certificate.earned", "progress.near_completion"]),
				enrollmentId: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			if (env.NODE_ENV !== "development") {
				throw new TRPCError({ code: "FORBIDDEN" });
			}

			if (input.type === "certificate.earned") {
				await notificationService.fireCertificateEarned(input.enrollmentId);
				return { fired: true };
			}

			// near_completion: build synthetic progress from enrollment
			const enr = await enrollmentRepository.findFirst({
				where: { id: input.enrollmentId },
				include: {
					course: {
						include: {
							sections: {
								where: { deletedAt: null },
								include: {
									lessons: { where: { deletedAt: null }, select: { id: true, title: true } },
								},
							},
						},
					},
				},
			});
			if (!enr) throw new TRPCError({ code: "NOT_FOUND" });

			const allLessons = enr.course.sections.flatMap((s) => s.lessons);
			const totalLessons = allLessons.length;
			const nextLesson = allLessons[0];

			await notificationService.fireProgressNearCompletion(
				enr.studentId,
				enr.courseId,
				{
					completedLessons: totalLessons > 2 ? totalLessons - 2 : 0,
					totalLessons,
					lessonsRemaining: 2,
					nextLessonId: nextLesson?.id ?? null,
					nextLessonTitle: nextLesson?.title ?? "",
				},
			);
			return { fired: true };
		}),
});
```

- [ ] **Step 2: Register in `server/api/root.ts`**

Add import and include in `appRouter`:

```ts
import { notificationsRouter } from "./routers/notifications";
// in createTRPCRouter({ ... }):
notifications: notificationsRouter,
```

- [ ] **Step 3: Create `scripts/fire-test-event.ts`**

```ts
// scripts/fire-test-event.ts
// Usage: pnpm tsx scripts/fire-test-event.ts certificate.earned <enrollmentId>
import { notificationService } from "@/server/services/notifications/notification.service";

const [type, enrollmentId] = process.argv.slice(2);

if (
	!type ||
	!enrollmentId ||
	!["certificate.earned", "progress.near_completion"].includes(type)
) {
	console.error(
		"Usage: tsx scripts/fire-test-event.ts <certificate.earned|progress.near_completion> <enrollmentId>",
	);
	process.exit(1);
}

if (type === "certificate.earned") {
	await notificationService.fireCertificateEarned(enrollmentId);
} else {
	// Fires a synthetic near-completion event with lessonsRemaining=2
	await notificationService.fireProgressNearCompletion("test", enrollmentId, {
		completedLessons: 8,
		totalLessons: 10,
		lessonsRemaining: 2,
		nextLessonId: null,
		nextLessonTitle: "Final Lesson",
	});
}

console.log("Event fired.");
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add server/api/routers/notifications.ts server/api/root.ts scripts/fire-test-event.ts
git commit -m "feat(notifications): add emitTest tRPC procedure and fire-test-event CLI"
```

---

## Task 14: ADR-014

**Files:**
- Create: `docs/adr/014-n8n-lifecycle-automations.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-014: n8n Lifecycle Automations

## Status
Accepted — 2026-05-17

## Context
Learnix has rich lifecycle signals (LessonProgress, Enrollment.completedAt) but no outbound communication. Baking email automations into Next.js couples ops/marketing changes to deploys.

## Decision
Three lifecycle email automations (certificate, inactivity nudge, near-completion nudge) are orchestrated by a self-hosted n8n instance:

- **Outbound webhooks** (Learnix → n8n): HMAC-SHA256 signed, at-least-once with 3 retries.
- **Inbound REST API** (n8n → Learnix): Bearer-token authenticated. `GET /api/notifications/inactive-students` feeds the daily cron; `POST /api/notifications/log` + `DELETE` manage idempotency.
- **Email delivery**: n8n calls `POST /api/notifications/send-email` which delegates to Learnix's existing `emailService` (Resend + React Email). n8n does not call Resend directly.
- **Idempotency**: `NotificationLog.dedupKey` unique constraint is the single source of truth.
- **Certificate PDF**: `@react-pdf/renderer` renders on demand in `app/api/certificates/[enrollmentId]`, returned as `application/pdf`. Auth via short-lived JWT signed with `N8N_API_TOKEN`. No PDF caching in v1.
- **Opt-out**: `User.emailNotificationsEnabled` (default `true`). Public `/unsubscribe?token=` page flips it; every n8n workflow gates on the flag before logging or sending.
- **Hosting**: self-hosted n8n on any VPS via `docker-compose.n8n.prod.yml` (n8n + Postgres). Workflow JSONs in `n8n/workflows/`, deployed via `pnpm sync:n8n`.

## Consequences
- Non-engineers can tweak automation logic in n8n UI without a code deploy.
- New notification channels (Slack, SMS) are "add a node," not a rewrite.
- `enrollment.progress` is now kept accurate by `LessonService.markLessonComplete`.
- n8n is an operational dependency; n8n downtime delays (but does not lose) event-driven notifications, as Learnix retries 3×.
```

- [ ] **Step 2: Commit**

```bash
git add docs/adr/014-n8n-lifecycle-automations.md
git commit -m "docs: add ADR-014 for n8n lifecycle automations"
```

---

## Self-review against spec

| Spec requirement | Task |
|---|---|
| `NotificationLog` model + `dedupKey` unique | Task 1 |
| `User.emailNotificationsEnabled` | Already implemented |
| `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET` env vars | Task 2 |
| NotificationLogRepository `tryLog` + `deleteByDedupKey` | Task 3 |
| HMAC sign/verify, `requireBearer`, certificate JWT | Task 4 |
| NotificationEmitter with retry + HMAC signing | Task 5 |
| `fireCertificateEarned`, `fireProgressNearCompletion`, `findInactiveStudents` | Task 6 |
| GET inactive-students, POST/DELETE log | Task 7 |
| Certificate PDF components + service | Task 8 |
| `GET /api/certificates/[enrollmentId]` with JWT auth | Task 9 |
| Unsubscribe page with token verification | Task 10 |
| `markLessonComplete` fires events + updates enrollment.progress | Task 11 |
| n8n workflows + sync script | Task 12 |
| `emitTest` tRPC + `fire-test-event.ts` | Task 13 |
| ADR-014 | Task 14 |

**Deviation from spec:** n8n calls `POST /api/notifications/send-email` (Learnix email service) instead of calling Resend directly. This is because React Email templates for all three lifecycle emails already exist in the codebase. The certificate email sends a PDF link rather than an attachment — consistent with the existing `CourseCertificateEmail` template.