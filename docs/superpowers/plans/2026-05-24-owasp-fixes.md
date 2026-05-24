# OWASP Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the OWASP security vulnerabilities found in issues #1 (auth), #2 (protected guards), and #3 (course) feature branches, and add ADR-016 as the project's security baseline.

**Architecture:** All fixes are surgical — no refactors. Each fix targets one violation of ADR-016. The order goes from most critical to least critical.

> **Note on instructor signup:** An earlier draft flagged `instructor.create` using `publicProcedure` as a privilege-escalation bug. This was a **false positive** — the instructor-onboarding spec (`docs/specs/2026-05-04-instructor-onboarding/requirements.md`) documents this as an intentional public self-service application that creates a *brand-new* account. `authService.signUp` already rejects duplicate emails, so no existing account can be hijacked or elevated. No change is required; see ADR-016 Rule 5.

**Tech Stack:** Next.js 15 App Router, tRPC, Prisma, Better Auth, Zod, Node.js crypto

---

## Files Changed

| File | Change |
|---|---|
| `docs/adr/016-owasp-security-rules.md` | **Created** — ADR (already done) |
| `server/api/routers/course.ts` | Pass `ctx.session.user.id` to update; add router-layer ownership check to delete |
| `server/services/course/course.service.ts` | Add `instructorId` ownership filter to `updateCourse` + re-throw `CourseError` |
| `app/api/uploads/route.ts` | Add auth check + MIME type validation |
| `server/api/routers/ai.ts` | Add ownership filter to `getGenerationStatus` |
| `app/api/notifications/log/route.ts` | Add Zod validation for POST body |
| `server/services/notifications/auth.ts` | Switch bearer comparison to `timingSafeEqual` |

---

## Task 1: Fix — IDOR on Course Update (any instructor can update any course)

**Severity:** High — OWASP A01  
**Issue:** `#3` (Feat/course)

**Files:**
- Modify: `server/api/routers/course.ts`
- Modify: `server/services/course/course.service.ts`

- [ ] **Step 1: Pass `ctx.session.user.id` in the router update handler**

In `server/api/routers/course.ts`, update the `update` mutation:

```ts
update: instructorProcedure
  .input(CourseFullUpdateDto)
  .mutation(async ({ ctx, input }) => {
    try {
      return await courseService.updateCourse(input.id, input, ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),
```

- [ ] **Step 2: Add `instructorId` parameter to `courseService.updateCourse` and add the ownership filter**

In `server/services/course/course.service.ts`, change the signature and add an ownership filter to the `findFirst` query:

```ts
async updateCourse(courseId: string, dto: CourseFullUpdateDto, instructorId: string) {
  try {
    const { sections: newSections, ...incomingCourseData } = dto;
    let existingStatus: string | undefined;

    const result = await courseRepository.transaction(async () => {
      const existingCourse = await courseRepository.findFirst({
        where: { id: courseId, instructorId },  // ← ownership filter added
        include: {
          sections: { include: { lessons: true } },
        },
      });

      if (!existingCourse) {
        throw new CourseError(`Course ${courseId} not found`, "NOT_FOUND");
      }
      // ... rest of the method unchanged
```

- [ ] **Step 3: Re-throw `CourseError` from the catch block so `NOT_FOUND` is not masked**

The existing outer `catch` in `updateCourse` re-wraps **every** error as `INTERNAL_SERVER_ERROR`, which would turn the ownership `NOT_FOUND` into a 500. Add a guard that re-throws `CourseError` as-is (same pattern already used in `getPublishedCourse`). The catch block becomes:

```ts
  } catch (error: unknown) {
    logger.error("Error updating course:", error);

    if (error instanceof CourseError) {
      throw error;
    }

    throw new CourseError(
      "Failed to update course",
      "INTERNAL_SERVER_ERROR",
      error,
      { dto },
    );
  }
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add server/api/routers/course.ts server/services/course/course.service.ts
git commit -m "fix(security): verify instructor ownership on course update (OWASP A01 IDOR)"
```

---

## Task 2: Fix — IDOR on Course Delete (any instructor can delete any course)

**Severity:** High — OWASP A01  
**Issue:** `#3` (Feat/course)

**Files:**
- Modify: `server/api/routers/course.ts`

The repository's `deleteCourse` routes all errors through `handleError`, which rethrows a plain `Error` (mapped to a 500). Rather than fight that, do the ownership check at the **router layer** using the existing `getOwnCourse` repository method + `TRPCError` — exactly the pattern already used by the `getOwnCourse` query handler in the same router. `handleServiceError` passes `TRPCError` through unchanged, so the client gets a proper `NOT_FOUND`.

- [ ] **Step 1: Add a router-layer ownership check to the delete handler**

In `server/api/routers/course.ts`, update the `delete` mutation. (`TRPCError` is already imported at the top of this file.)

```ts
delete: instructorProcedure
  .input(CourseSchema.shape.id)
  .mutation(async ({ ctx, input }) => {
    try {
      const owned = await courseRepository.getOwnCourse(input, ctx.session.user.id);
      if (!owned) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Course not found or access denied",
        });
      }
      return await courseRepository.deleteCourse(input, true);
    } catch (error) {
      handleServiceError(error);
    }
  }),
```

No change to `courseRepository.deleteCourse` is needed — its signature stays `deleteCourse(id, softDelete?)`.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/api/routers/course.ts
git commit -m "fix(security): verify instructor ownership on course delete (OWASP A01 IDOR)"
```

---

## Task 3: Fix — Unauthenticated File Upload + Missing MIME Validation

**Severity:** High + Medium — OWASP A01, A04  
**Issue:** `#3` (Feat/course) — thumbnails/videos uploaded from course forms

**Files:**
- Modify: `app/api/uploads/route.ts`

- [ ] **Step 1: Replace the entire route file**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/better-auth/server";
import VercelService from "@/server/services/versel/vercel.service";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Invalid or missing file." }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    }

    const vercelService = new VercelService();
    const res = await vercelService.uploadFileToVercelStorage(file);

    return NextResponse.json({ mediaUrl: res.url });
  } catch (error) {
    console.error("Upload file error:", error);
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the `getSession` import path is correct**

```bash
grep -r "export.*getSession" server/better-auth/
```

Expected output should show the function is exported from `server/better-auth/server.ts`. If the path differs, update the import accordingly.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Biome**

```bash
pnpm check:write
```

- [ ] **Step 5: Commit**

```bash
git add app/api/uploads/route.ts
git commit -m "fix(security): require auth + MIME allowlist on upload endpoint (OWASP A01, A04)"
```

---

## Task 4: Fix — IDOR on Course Generation Status

**Severity:** Medium — OWASP A01  
**Issue:** `#3` (Feat/course) — AI course builder flow

**Files:**
- Modify: `server/api/routers/ai.ts`

- [ ] **Step 1: Add `ctx` destructuring and ownership filter**

In `server/api/routers/ai.ts`, update `getGenerationStatus`:

```ts
getGenerationStatus: instructorProcedure
  .input(processStepSchema)
  .query(async ({ ctx, input }) => {
    try {
      const courseGen = await courseGenerationRepository.findFirst({
        where: {
          id: input.courseGenerationId,
          instructorId: ctx.session.user.id,
        },
      });

      return {
        currentStep: courseGen?.step,
        sectionsData: courseGen?.content
          ? (courseGen.content as unknown as CourseSchemaOutput)
          : {},
      };
    } catch (error) {
      handleServiceError(error);
    }
  }),
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/api/routers/ai.ts
git commit -m "fix(security): scope getGenerationStatus to requesting instructor (OWASP A01 IDOR)"
```

---

## Task 5: Fix — Unvalidated Notification Log Body

**Severity:** Medium — OWASP A03  
**Issue:** `#2` (feat: added protected guard and user data) — n8n webhook integration

**Files:**
- Modify: `app/api/notifications/log/route.ts`

- [ ] **Step 1: Add Zod schema and validate body before calling the repository**

```ts
import { z } from "zod";
import { notificationLogRepository } from "@/server/repositories/notificationLog.repository";
import { requireBearer } from "@/server/services/notifications/auth";

// Zod v4: z.record requires both a key schema and a value schema
const LogBodySchema = z.object({
  dedupKey: z.string().min(1),
  userId: z.string().min(1),
  automation: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  try {
    requireBearer(req);
  } catch (res) {
    return res as Response;
  }

  const raw = await req.json();
  const parsed = LogBodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid_payload", issues: parsed.error.issues }, { status: 422 });
  }

  const result = await notificationLogRepository.tryLog(parsed.data);
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

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Biome**

```bash
pnpm check:write
```

- [ ] **Step 4: Commit**

```bash
git add app/api/notifications/log/route.ts
git commit -m "fix(security): validate notification log POST body with Zod (OWASP A03)"
```

---

## Task 6: Fix — Bearer Token Timing-Safe Comparison

**Severity:** Low — OWASP A02  
**Issue:** `#2` (feat: added protected guard) — n8n webhook auth

The existing `requireBearer` in `server/services/notifications/auth.ts` already uses `===`. The `emails/send` route handler does the same inline. Both must use `timingSafeEqual`.

**Files:**
- Modify: `server/services/notifications/auth.ts`
- Modify: `app/api/emails/send/route.ts`

- [ ] **Step 1: Update `requireBearer` in `auth.ts` to use `timingSafeEqual`**

```ts
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
  const h = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.N8N_API_TOKEN}`);
  const actual = Buffer.from(h);
  const valid =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!valid) {
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

- [ ] **Step 2: Update the inline check in `app/api/emails/send/route.ts` to use `requireBearer`**

```ts
import { type NextRequest, NextResponse } from "next/server";
import {
  InvalidPayloadError,
  ResendSendError,
  UnknownTemplateError,
} from "@/server/services/email/email.errors";
import { emailService } from "@/server/services/email/email.service";
import { requireBearer } from "@/server/services/notifications/auth";

export async function POST(req: NextRequest) {
  try {
    requireBearer(req);
  } catch (res) {
    return res as Response;
  }

  try {
    const body = await req.json();
    const result = await emailService.send(body);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof UnknownTemplateError) {
      return NextResponse.json({ error: "unknown_template" }, { status: 400 });
    }
    if (e instanceof InvalidPayloadError) {
      return NextResponse.json(
        { error: "invalid_payload", issues: e.issues },
        { status: 422 },
      );
    }
    if (e instanceof ResendSendError) {
      return NextResponse.json(
        { error: "resend_failed", detail: e.message },
        { status: 502 },
      );
    }
    throw e;
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Biome**

```bash
pnpm check:write
```

- [ ] **Step 5: Commit**

```bash
git add server/services/notifications/auth.ts app/api/emails/send/route.ts
git commit -m "fix(security): timing-safe bearer token comparison (OWASP A02)"
```

---

## Self-Review

### Spec coverage
The genuine vulnerabilities found in Phase 5 of the security audit each have a corresponding task:
1. ✅ Task 1 — IDOR course update
2. ✅ Task 2 — IDOR course delete
3. ✅ Task 3 — Unauthenticated upload + no MIME validation
4. ✅ Task 4 — IDOR AI course generation status
5. ✅ Task 5 — Unvalidated notification log body
6. ✅ Task 6 — Timing-unsafe bearer comparison

**Dropped (false positive):** the originally-flagged "privilege escalation via public `instructor.create`" is **not** a vulnerability — the instructor-onboarding spec documents public self-service signup as intended, and `authService.signUp` enforces email uniqueness so no existing account can be hijacked. See ADR-016 Rule 5 and the note at the top of this plan.

### Placeholder scan
No TBDs or placeholder steps — all code blocks are complete.

### Type consistency
- `courseService.updateCourse` gains a third `instructorId: string` parameter in Task 1; the router call in Task 1 passes it correctly, and the `catch` block re-throws `CourseError` so the `NOT_FOUND` code is preserved.
- Task 2 does **not** change `courseRepository.deleteCourse`'s signature — it adds a router-layer ownership check via the existing `getOwnCourse(id, userId)` method and throws `TRPCError` (already imported in `course.ts`), which `handleServiceError` passes through unchanged.
- `courseGenerationRepository.findFirst` is already typed to accept a `where` clause; Task 4 adds `instructorId` to that clause which matches the Prisma schema.
- All Zod schemas use the v4 two-argument `z.record(z.string(), …)` form (project runs Zod 4.3.6).