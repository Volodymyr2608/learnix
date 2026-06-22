# In-platform Certificates & Direct Lifecycle Emails — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give students a "My Certificates" dashboard page to download completion certificates, and send the certificate-earned and near-completion emails in-process via Resend instead of the (now-offline) n8n webhook.

**Architecture:** A new `certificate` tRPC router → `certificateService.listEarned` → a new `enrollmentRepository.findCompletedByStudent` query backs a server-rendered `/dashboard/certificates` page. The page mints the existing signed certificate token per row and links to the unchanged PDF route. The two `notificationService.fire*` methods are rewritten to dedup via `notificationLogRepository.tryLog` then send through the existing `emailService`; the outbound `notificationEmitter` and its dead HMAC helpers are deleted.

**Tech Stack:** Next.js 16 App Router (RSC), tRPC, Prisma, Resend (`emailService`), Vitest, Biome.

## Global Constraints

- **Component conventions:** every component folder has a colocated `types.ts` (all prop types there, never inline). No nested ternaries in JSX — use early-return sub-components or sequential boolean guards. Extract repeated layout into named sub-components.
- **Layering:** routers → services → repositories. No DB access in routers; routers map errors via `handleServiceError`.
- **No new env vars, no DB migration.** Reuse `CERTIFICATE_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `BASE_URL` (all already required).
- **Email opt-out** is enforced inside `emailService.send` for STANDARD templates — do NOT re-implement it.
- **Dedup** uses the existing `notificationLog.dedupKey` unique constraint via `notificationLogRepository.tryLog`; check-then-send for at-most-once-per-enrollment.
- **Lint/format:** Biome. Run `pnpm check:write` before committing if formatting drifts.

---

### Task 1: `EarnedCertificate` DTO, repository query, and `certificateService.listEarned`

**Files:**
- Create: `server/entities/certificate/certificate.ts`
- Modify: `server/repositories/enrollment.repository.ts` (add `findCompletedByStudent`)
- Modify: `server/services/certificates/certificate.service.ts` (add `listEarned`)
- Test: `server/services/certificates/certificate.service.test.ts`

**Interfaces:**
- Produces: `type EarnedCertificate = { enrollmentId: string; courseId: string; courseTitle: string; instructorName: string; completedAt: Date }`
- Produces: `enrollmentRepository.findCompletedByStudent(studentId: string)` → rows with `id`, `courseId`, `completedAt`, and nested `course.title` + `course.instructor.name`.
- Produces: `certificateService.listEarned(studentId: string): Promise<EarnedCertificate[]>`

- [ ] **Step 1: Create the DTO type**

`server/entities/certificate/certificate.ts`:

```ts
export type EarnedCertificate = {
	enrollmentId: string;
	courseId: string;
	courseTitle: string;
	instructorName: string;
	completedAt: Date;
};
```

- [ ] **Step 2: Write the failing service test**

`server/services/certificates/certificate.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnrollmentRepo = {
	findCompletedByStudent: vi.fn(),
};

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
// renderPdf pulls in @react-pdf/renderer + the Certificate component; stub the
// React PDF document so importing the service stays cheap and DOM-free.
vi.mock("@/app/_components/Certificate", () => ({ CertificateDocument: () => null }));

const { certificateService } = await import("./certificate.service");

describe("CertificateService.listEarned", () => {
	beforeEach(() => vi.clearAllMocks());

	it("maps completed enrollments to EarnedCertificate DTOs", async () => {
		const completedAt = new Date("2026-06-20T10:00:00Z");
		mockEnrollmentRepo.findCompletedByStudent.mockResolvedValue([
			{
				id: "enr-1",
				courseId: "course-1",
				completedAt,
				course: { title: "TypeScript Pro", instructor: { name: "Ada" } },
			},
		]);

		const result = await certificateService.listEarned("student-1");

		expect(mockEnrollmentRepo.findCompletedByStudent).toHaveBeenCalledWith("student-1");
		expect(result).toEqual([
			{
				enrollmentId: "enr-1",
				courseId: "course-1",
				courseTitle: "TypeScript Pro",
				instructorName: "Ada",
				completedAt,
			},
		]);
	});

	it("returns an empty array when the student has no completed enrollments", async () => {
		mockEnrollmentRepo.findCompletedByStudent.mockResolvedValue([]);
		expect(await certificateService.listEarned("student-1")).toEqual([]);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test:unit -- certificate.service`
Expected: FAIL — `certificateService.listEarned is not a function`.

- [ ] **Step 4: Add the repository query**

In `server/repositories/enrollment.repository.ts`, add after `findByIdWithRelations`:

```ts
	findCompletedByStudent(studentId: string) {
		return this.findMany({
			where: { studentId, completedAt: { not: null } },
			orderBy: { completedAt: "desc" },
			select: {
				id: true,
				courseId: true,
				completedAt: true,
				course: {
					select: {
						title: true,
						instructor: { select: { name: true } },
					},
				},
			},
		});
	}
```

- [ ] **Step 5: Implement `listEarned` in the service**

In `server/services/certificates/certificate.service.ts`, add the import and method:

```ts
import type { EarnedCertificate } from "@/server/entities/certificate/certificate";
```

```ts
	async listEarned(studentId: string): Promise<EarnedCertificate[]> {
		const rows = await enrollmentRepository.findCompletedByStudent(studentId);
		return rows.flatMap((row) =>
			row.completedAt
				? [
						{
							enrollmentId: row.id,
							courseId: row.courseId,
							courseTitle: row.course.title,
							instructorName: row.course.instructor.name,
							completedAt: row.completedAt,
						},
					]
				: [],
		);
	}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test:unit -- certificate.service`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/entities/certificate server/repositories/enrollment.repository.ts server/services/certificates/certificate.service.ts server/services/certificates/certificate.service.test.ts
git commit -m "feat(certificates): add listEarned service and completed-enrollment query"
```

---

### Task 2: `certificate` tRPC router

**Files:**
- Create: `server/api/routers/certificate.ts`
- Modify: `server/api/root.ts`

**Interfaces:**
- Consumes: `certificateService.listEarned` (Task 1).
- Produces: `api.certificate.listEarned()` (`studentProcedure`) → `EarnedCertificate[]`.

- [ ] **Step 1: Create the router**

`server/api/routers/certificate.ts`:

```ts
import { createTRPCRouter, studentProcedure } from "@/server/api/trpc";
import { certificateService } from "@/server/services/certificates/certificate.service";
import { handleServiceError } from "@/server/utils/handleServiceError";

export const certificateRouter = createTRPCRouter({
	listEarned: studentProcedure.query(async ({ ctx }) => {
		try {
			return await certificateService.listEarned(ctx.session.user.id);
		} catch (error) {
			handleServiceError(error);
		}
	}),
});
```

- [ ] **Step 2: Register the router**

In `server/api/root.ts`, add the import (alphabetical near `courseRouter`) and the entry in `createTRPCRouter`:

```ts
import { certificateRouter } from "@/server/api/routers/certificate";
```

```ts
	certificate: certificateRouter,
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm typecheck`
Expected: PASS (no errors). Confirms `ctx.session.user.id` and the service signature line up.

- [ ] **Step 4: Commit**

```bash
git add server/api/routers/certificate.ts server/api/root.ts
git commit -m "feat(certificates): add certificate.listEarned tRPC router"
```

---

### Task 3: "My Certificates" page, components, nav link

**Files:**
- Create: `app/dashboard/certificates/page.tsx`
- Create: `app/_components/Certificate/components/CertificatesList/index.tsx`
- Create: `app/_components/Certificate/components/CertificatesList/types.ts`
- Create: `app/_components/Certificate/components/CertificatesEmptyState/index.tsx`
- Modify: `lib/constants/urls/studentsUrls.ts`
- Modify: `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`

**Interfaces:**
- Consumes: `api.certificate.listEarned()` (Task 2) via the **server** tRPC caller (`@/trpc/server`), and `signCertificateToken` (`@/server/services/notifications/auth`).
- Produces: route `/dashboard/certificates`; `STUDENT_URLS.certificates`.

- [ ] **Step 1: Add the URL constant**

In `lib/constants/urls/studentsUrls.ts`, add inside `STUDENT_URLS`:

```ts
	certificates: `${MAIN_URL}/certificates`,
```

- [ ] **Step 2: Add the prop types**

`app/_components/Certificate/components/CertificatesList/types.ts`:

```ts
export type CertificateListItem = {
	enrollmentId: string;
	courseTitle: string;
	instructorName: string;
	completedAt: Date;
	downloadUrl: string;
};

export type CertificatesListProps = {
	items: CertificateListItem[];
};

export type CertificateRowProps = {
	item: CertificateListItem;
};
```

- [ ] **Step 3: Build the empty state**

`app/_components/Certificate/components/CertificatesEmptyState/index.tsx`:

```tsx
import { Award } from "lucide-react";

const CertificatesEmptyState = () => {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-16 text-center">
			<Award className="mb-4 h-10 w-10 text-muted-foreground" />
			<h2 className="font-semibold text-lg">No certificates yet</h2>
			<p className="mt-1 max-w-sm text-muted-foreground text-sm">
				Complete a course and your certificate will appear here, ready to
				download.
			</p>
		</div>
	);
};

export default CertificatesEmptyState;
```

- [ ] **Step 4: Build the list + row**

`app/_components/Certificate/components/CertificatesList/index.tsx`:

```tsx
import { Download } from "lucide-react";
import type {
	CertificateRowProps,
	CertificatesListProps,
} from "@/app/_components/Certificate/components/CertificatesList/types";

function CertificateRow({ item }: CertificateRowProps) {
	return (
		<div className="flex items-center justify-between rounded-lg border border-border p-4">
			<div>
				<h3 className="font-medium">{item.courseTitle}</h3>
				<p className="text-muted-foreground text-sm">
					{item.instructorName} ·{" "}
					{item.completedAt.toLocaleDateString(undefined, {
						year: "numeric",
						month: "long",
						day: "numeric",
					})}
				</p>
			</div>
			<a
				className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-sm hover:bg-primary/90"
				download
				href={item.downloadUrl}
			>
				<Download className="h-4 w-4" />
				Download
			</a>
		</div>
	);
}

const CertificatesList = ({ items }: CertificatesListProps) => {
	return (
		<div className="space-y-3">
			{items.map((item) => (
				<CertificateRow item={item} key={item.enrollmentId} />
			))}
		</div>
	);
};

export default CertificatesList;
```

- [ ] **Step 5: Build the page (RSC) — mints a token per row**

`app/dashboard/certificates/page.tsx`:

```tsx
import CertificatesEmptyState from "@/app/_components/Certificate/components/CertificatesEmptyState";
import CertificatesList from "@/app/_components/Certificate/components/CertificatesList";
import type { CertificateListItem } from "@/app/_components/Certificate/components/CertificatesList/types";
import { env } from "@/lib/env";
import { signCertificateToken } from "@/server/services/notifications/auth";
import { api } from "@/trpc/server";

export default async function CertificatesPage() {
	const earned = await api.certificate.listEarned();

	const items: CertificateListItem[] = await Promise.all(
		earned.map(async (cert) => {
			const token = await signCertificateToken(cert.enrollmentId);
			return {
				enrollmentId: cert.enrollmentId,
				courseTitle: cert.courseTitle,
				instructorName: cert.instructorName,
				completedAt: cert.completedAt,
				downloadUrl: `${env.BASE_URL}/api/certificates/${cert.enrollmentId}?token=${token}`,
			};
		}),
	);

	return (
		<div className="mx-auto max-w-3xl px-4 py-8">
			<h1 className="font-bold text-2xl">My Certificates</h1>
			<p className="mt-1 text-muted-foreground">
				Download certificates for the courses you've completed.
			</p>
			<div className="mt-6">
				{items.length === 0 && <CertificatesEmptyState />}
				{items.length > 0 && <CertificatesList items={items} />}
			</div>
		</div>
	);
}
```

> Note: confirm the server caller import path is `@/trpc/server` (matches CLAUDE.md "Server RSC: `api` exported from `trpc/server.ts`"). If a sibling dashboard page imports it differently, match that.

- [ ] **Step 6: Add the nav link**

In `app/_components/Dashboard/Sidebar/components/Navigation/index.tsx`: add `Award` to the `lucide-react` import, and add to `studentItems` (after the `Progress` item):

```ts
	{
		title: "Certificates",
		href: STUDENT_URLS.certificates,
		icon: Award,
	},
```

- [ ] **Step 7: Verify build + typecheck**

Run: `pnpm typecheck && pnpm check`
Expected: PASS. (Biome may reorder imports/classes — run `pnpm check:write` if it reports fixable issues, then re-run.)

- [ ] **Step 8: Manual smoke (optional but recommended)**

Run: `pnpm dev`, sign in as a student with a completed course, visit `/dashboard/certificates`, click **Download** → a PDF downloads. With no completed course, the empty state shows.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/certificates app/_components/Certificate/components/CertificatesList app/_components/Certificate/components/CertificatesEmptyState lib/constants/urls/studentsUrls.ts app/_components/Dashboard/Sidebar/components/Navigation/index.tsx
git commit -m "feat(certificates): add My Certificates dashboard page and nav link"
```

---

### Task 4: Send the certificate-earned email directly (replace n8n emit) with dedup

**Files:**
- Modify: `server/services/notifications/notification.service.ts` (`fireCertificateEarned`)
- Test: `server/services/notifications/notification.service.test.ts` (create)

**Interfaces:**
- Consumes: `emailService.send`, `notificationLogRepository.tryLog`, `signCertificateToken`, `signUnsubscribeToken`, `enrollmentRepository.findByIdWithRelations`.
- Behaviour: dedupKey `"<studentId>:certificate:<courseId>"`, automation `"certificate_earned"`; send only when `tryLog` returns `created: true`.

- [ ] **Step 1: Write the failing test**

`server/services/notifications/notification.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnrollmentRepo = {
	findByIdWithRelations: vi.fn(),
	findByStudentCourseWithRelations: vi.fn(),
};
const mockNotificationLogRepo = { tryLog: vi.fn() };
const mockEmailService = { send: vi.fn() };

vi.mock("@/server/repositories/enrollment.repository", () => ({
	enrollmentRepository: mockEnrollmentRepo,
}));
vi.mock("@/server/repositories/lessonProgress.repository", () => ({
	lessonProgressRepository: {},
}));
vi.mock("@/server/repositories/notificationLog.repository", () => ({
	notificationLogRepository: mockNotificationLogRepo,
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: mockEmailService,
}));
vi.mock("./auth", () => ({
	signCertificateToken: vi.fn().mockResolvedValue("cert-tok"),
}));
vi.mock("@/server/services/email/unsubscribe-token", () => ({
	signUnsubscribeToken: vi.fn().mockResolvedValue("unsub-tok"),
}));

const { notificationService } = await import("./notification.service");

const ENR = {
	id: "enr-1",
	studentId: "student-1",
	courseId: "course-1",
	completedAt: new Date("2026-06-20T10:00:00Z"),
	student: {
		id: "student-1",
		email: "stu@example.com",
		name: "Stu",
		emailNotificationsEnabled: true,
	},
	course: { id: "course-1", title: "TS Pro", instructor: { name: "Ada" } },
};

describe("NotificationService.fireCertificateEarned", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnrollmentRepo.findByIdWithRelations.mockResolvedValue(ENR);
	});

	it("dedups then sends the course.certificate email", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: true });

		await notificationService.fireCertificateEarned("enr-1");

		expect(mockNotificationLogRepo.tryLog).toHaveBeenCalledWith(
			expect.objectContaining({
				dedupKey: "student-1:certificate:course-1",
				userId: "student-1",
				automation: "certificate_earned",
			}),
		);
		expect(mockEmailService.send).toHaveBeenCalledTimes(1);
		const arg = mockEmailService.send.mock.calls[0][0];
		expect(arg.templateKey).toBe("course.certificate");
		expect(arg.toEmail).toBe("stu@example.com");
		expect(arg.userId).toBe("student-1");
		expect(arg.payload).toMatchObject({
			studentName: "Stu",
			courseTitle: "TS Pro",
			instructorName: "Ada",
		});
		expect(arg.payload.certificatePdfUrl).toContain("token=cert-tok");
	});

	it("does not send when the email was already logged for this enrollment", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: false });

		await notificationService.fireCertificateEarned("enr-1");

		expect(mockEmailService.send).not.toHaveBeenCalled();
	});

	it("returns silently when the enrollment is missing", async () => {
		mockEnrollmentRepo.findByIdWithRelations.mockResolvedValue(null);

		await notificationService.fireCertificateEarned("missing");

		expect(mockNotificationLogRepo.tryLog).not.toHaveBeenCalled();
		expect(mockEmailService.send).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- notification.service`
Expected: FAIL — the current implementation calls `notificationEmitter.emit`, so `emailService.send` / `tryLog` are never called.

- [ ] **Step 3: Rewrite `fireCertificateEarned`**

In `server/services/notifications/notification.service.ts`, update imports — remove `notificationEmitter`, add:

```ts
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { emailService } from "@/server/services/email/email.service";
```

Replace the body of `fireCertificateEarned`:

```ts
	async fireCertificateEarned(enrollmentId: string): Promise<void> {
		const enr = await enrollmentRepository.findByIdWithRelations(enrollmentId);
		if (!enr) return;

		const logged = await notificationLogRepository.tryLog({
			dedupKey: `${enr.studentId}:certificate:${enr.courseId}`,
			userId: enr.studentId,
			automation: "certificate_earned",
		});
		if (!logged.created) return;

		const [certToken, unsubToken] = await Promise.all([
			signCertificateToken(enrollmentId),
			signUnsubscribeToken(enr.studentId),
		]);

		await emailService.send({
			templateKey: "course.certificate",
			toEmail: enr.student.email,
			userId: enr.studentId,
			payload: {
				studentName: enr.student.name,
				courseTitle: enr.course.title,
				instructorName: enr.course.instructor.name,
				certificatePdfUrl: `${env.BASE_URL}/api/certificates/${enrollmentId}?token=${certToken}`,
				unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
			},
		});
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- notification.service`
Expected: PASS (3 tests in the `fireCertificateEarned` describe).

- [ ] **Step 5: Commit**

```bash
git add server/services/notifications/notification.service.ts server/services/notifications/notification.service.test.ts
git commit -m "feat(notifications): send certificate email directly via Resend with dedup"
```

---

### Task 5: Send the near-completion email directly (replace n8n emit) with dedup

**Files:**
- Modify: `server/services/notifications/notification.service.ts` (`fireProgressNearCompletion`)
- Test: `server/services/notifications/notification.service.test.ts` (extend)

**Interfaces:**
- Consumes: same as Task 4 plus `enrollmentRepository.findByStudentCourseWithRelations`.
- Behaviour: dedupKey `"<studentId>:near_completion:<courseId>"`, automation `"near_completion"`; send only when `created: true`.

- [ ] **Step 1: Extend the test file with a near-completion describe**

Append to `server/services/notifications/notification.service.test.ts`:

```ts
describe("NotificationService.fireProgressNearCompletion", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnrollmentRepo.findByStudentCourseWithRelations.mockResolvedValue({
			id: "enr-1",
			studentId: "student-1",
			courseId: "course-1",
			student: {
				email: "stu@example.com",
				name: "Stu",
				emailNotificationsEnabled: true,
			},
			course: { id: "course-1", title: "TS Pro" },
		});
	});

	const PROGRESS = {
		completedLessons: 8,
		totalLessons: 10,
		lessonsRemaining: 2,
		nextLessonId: "lesson-9",
		nextLessonTitle: "Generics",
	};

	it("dedups then sends the engagement.near-completion email", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: true });

		await notificationService.fireProgressNearCompletion(
			"student-1",
			"course-1",
			PROGRESS,
		);

		expect(mockNotificationLogRepo.tryLog).toHaveBeenCalledWith(
			expect.objectContaining({
				dedupKey: "student-1:near_completion:course-1",
				userId: "student-1",
				automation: "near_completion",
			}),
		);
		const arg = mockEmailService.send.mock.calls[0][0];
		expect(arg.templateKey).toBe("engagement.near-completion");
		expect(arg.toEmail).toBe("stu@example.com");
		expect(arg.payload).toMatchObject({
			studentName: "Stu",
			courseTitle: "TS Pro",
			lessonsRemaining: 2,
		});
		expect(arg.payload.nextLessonUrl).toContain("lesson-9");
	});

	it("does not send twice for the same enrollment", async () => {
		mockNotificationLogRepo.tryLog.mockResolvedValue({ created: false });

		await notificationService.fireProgressNearCompletion(
			"student-1",
			"course-1",
			PROGRESS,
		);

		expect(mockEmailService.send).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- notification.service`
Expected: FAIL on the new describe — current code emits to n8n.

- [ ] **Step 3: Rewrite `fireProgressNearCompletion`**

Replace the body of `fireProgressNearCompletion` in `notification.service.ts`:

```ts
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
		const enr = await enrollmentRepository.findByStudentCourseWithRelations(
			studentId,
			courseId,
		);
		if (!enr) return;

		const logged = await notificationLogRepository.tryLog({
			dedupKey: `${studentId}:near_completion:${courseId}`,
			userId: studentId,
			automation: "near_completion",
		});
		if (!logged.created) return;

		const unsubToken = await signUnsubscribeToken(studentId);
		const nextLessonUrl = progress.nextLessonId
			? `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn/${progress.nextLessonId}`
			: `${env.BASE_URL}/dashboard/courses/${enr.course.id}/learn`;

		await emailService.send({
			templateKey: "engagement.near-completion",
			toEmail: enr.student.email,
			userId: studentId,
			payload: {
				studentName: enr.student.name,
				courseTitle: enr.course.title,
				lessonsRemaining: progress.lessonsRemaining,
				nextLessonUrl,
				unsubscribeUrl: `${env.BASE_URL}/unsubscribe?token=${unsubToken}`,
			},
		});
	}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- notification.service`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add server/services/notifications/notification.service.ts server/services/notifications/notification.service.test.ts
git commit -m "feat(notifications): send near-completion email directly via Resend with dedup"
```

---

### Task 6: Delete the dead n8n emitter and HMAC helpers

**Files:**
- Delete: `server/services/notifications/notificationEmitter.ts`
- Modify: `server/services/notifications/auth.ts` (remove `signHmac`, `verifyHmac`)

**Interfaces:** none produced. This removes code with no remaining callers (verified: only `notificationEmitter` imported `signHmac`; `verifyHmac` had no callers).

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "notificationEmitter\|signHmac\|verifyHmac" --include="*.ts" server app scripts | grep -v node_modules`
Expected: only matches inside `notificationEmitter.ts` and `auth.ts` themselves. If anything else references them, STOP and reconcile before deleting.

- [ ] **Step 2: Delete the emitter**

```bash
git rm server/services/notifications/notificationEmitter.ts
```

- [ ] **Step 3: Remove the dead HMAC helpers from `auth.ts`**

In `server/services/notifications/auth.ts`, delete the `signHmac` and `verifyHmac` functions and the now-unused `createHmac, timingSafeEqual` from the `node:crypto` import **only if** `timingSafeEqual` is no longer used. `requireBearer` still uses `timingSafeEqual` and `Buffer`, so keep `timingSafeEqual`; drop `createHmac`:

```ts
import { timingSafeEqual } from "node:crypto";
```

Delete both functions:

```ts
// DELETE:
// export function signHmac(body: string): string { ... }
// export function verifyHmac(body: string, header: string | null): boolean { ... }
```

- [ ] **Step 4: Verify typecheck + lint + full unit suite**

Run: `pnpm typecheck && pnpm check && pnpm test:unit`
Expected: PASS. No unresolved imports; `notification.service` tests still green.

- [ ] **Step 5: Commit**

```bash
git add server/services/notifications/auth.ts
git commit -m "chore(notifications): remove dead n8n outbound emitter and HMAC helpers"
```

---

## Self-Review

**Spec coverage:**
- FR1–FR3 (page lists completed courses, empty state, download) → Tasks 1–3.
- FR4 (nav link) → Task 3 Step 6.
- FR5 (server-minted token, own enrollments only) → Task 1 (`findCompletedByStudent` filters by `studentId`) + Task 3 Step 5.
- FR6 / FR17 (unchanged PDF route, 409 not-completed, emailed link still works) → no route change; download URL format preserved in Tasks 3 & 4.
- FR7–FR10 (certificate email direct, opt-out, dedup, non-blocking) → Task 4 (+ existing `.catch` in `lesson.service.ts`, unchanged; opt-out inside `emailService`).
- FR11–FR14 (near-completion email direct, dedup, opt-out, non-blocking) → Task 5.
- FR15 (emitter no longer invoked) + cleanup → Task 6.
- FR16 (inbound n8n routes untouched) → no task touches `app/api/notifications/*` or `app/api/emails/send`.

**Placeholder scan:** none — every code step shows full content; no "TBD"/"handle edge cases".

**Type consistency:** `EarnedCertificate` fields used identically in Tasks 1→3; `findCompletedByStudent`, `listEarned`, `tryLog({dedupKey,userId,automation})`, and `emailService.send({templateKey,toEmail,userId,payload})` signatures match across tasks and the real source read during planning.

**Note for executor:** `lesson.service.ts` is intentionally NOT modified — it already calls both `fire*` methods fire-and-forget with `.catch(logger.warn)`, satisfying FR10/FR14.