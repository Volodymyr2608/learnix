# ADR-016: OWASP Security Rules for Learnix

- **Status**: Accepted
- **Date**: 2026-05

## Context

Security issues were found across the codebase corresponding to OWASP Top 10 categories. This ADR documents the security rules that every feature must follow, derived from the vulnerabilities found during the `fix/owasp` audit. Future features must apply these rules to prevent the same classes of bugs from being introduced again.

## Rules

### Rule 1 — Every non-public endpoint must authenticate (OWASP A01)

Every API route handler (`app/api/`) and tRPC procedure that performs a state change or returns private data must verify a session at the entry point.

**tRPC:** Choose the correct procedure type — never use `publicProcedure` for anything that requires authentication or grants privileges.

```
publicProcedure       → truly public (read-only, no PII, no privilege side-effects)
protectedProcedure    → any authenticated action
instructorProcedure   → instructor-only; implies authentication
studentProcedure      → student-only; implies authentication
adminProcedure        → admin-only; implies authentication
```

**Route handlers:** Add a session check at the very top before reading the body.

```ts
// ✅ correct
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  // ...
}

// ❌ wrong — processes body before auth
export async function POST(req: Request) {
  const { data } = await req.json();
  // session check happens after
}
```

**Never use `publicProcedure` for any mutation that:**
- Creates a user account or sets a user role
- Reads or modifies data owned by a specific user
- Triggers an external service (email, storage, AI)

---

### Rule 2 — Ownership must be verified, not just authentication (OWASP A01 / IDOR)

Authentication proves *who* the caller is. Authorization proves *what* they are allowed to access. Both are required.

Every tRPC handler that receives an entity ID (`courseId`, `lessonId`, `generationId`, …) must verify that the entity belongs to the calling user before reading or writing it.

**Pattern for instructor-owned resources:**

```ts
// ✅ correct — service or repository verifies ownership
update: instructorProcedure
  .input(CourseFullUpdateDto)
  .mutation(async ({ ctx, input }) => {
    try {
      return await courseService.updateCourse(input.id, input, ctx.session.user.id);
    } catch (error) {
      handleServiceError(error);
    }
  }),

// In courseService.updateCourse:
const existing = await courseRepository.findFirst({
  where: { id: courseId, instructorId: userId },  // ← ownership filter
});
if (!existing) throw new CourseError("Not found", "NOT_FOUND");
```

**Pattern for student-owned resources:** filter by `studentId` / `userId` in every query or 404 if not found.

**Never** pass a raw ID from `input` to a repository `findOne` / `update` / `delete` without including the caller's userId in the where clause.

---

### Rule 3 — All API route inputs must be validated with Zod (OWASP A03)

Request bodies arriving at route handlers are external input and must be validated before use.

```ts
// ✅ correct (Zod v4 — z.record requires both key and value schemas)
const LogBodySchema = z.object({
  dedupKey: z.string().min(1),
  userId: z.string().min(1),
  automation: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  // auth first (Rule 1), then parse
  const raw = await req.json();
  const parsed = LogBodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "invalid_payload" }, { status: 422 });
  // use parsed.data
}

// ❌ wrong — raw body passed directly to a service/repository
const body = await req.json();
await someRepository.create(body);
```

tRPC procedures are exempt because `.input(ZodSchema)` already validates.

---

### Rule 4 — File uploads must enforce MIME type and role (OWASP A04)

Upload endpoints must:
1. Require an authenticated session (Rule 1) and the correct role.
2. Validate `file.type` against an explicit allowlist before uploading.
3. Never trust the file extension from the original filename for security decisions.

```ts
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

if (!ALLOWED_MIME_TYPES.has(file.type)) {
  return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
}
```

---

### Rule 5 — Role changes on *existing* accounts must never be reachable by an unprivileged caller (OWASP A01)

Distinguish two cases:

1. **Elevating an existing account's role** (e.g., promoting a logged-in `STUDENT` to `INSTRUCTOR`/`ADMIN`) must be behind `adminProcedure` or an internally-called, non-exposed service method. It must never be triggerable by the account holder themselves or by an anonymous caller.

2. **Self-service signup that creates a brand-new account with a role** (e.g., the public instructor application at `/instructors`, see the instructor-onboarding spec) is allowed to be a `publicProcedure`, **but only if** it:
   - Creates a **new** user account — it must never elevate the role of an already-authenticated session's account.
   - Enforces email uniqueness so an existing account cannot be hijacked (`authService.signUp` rejects duplicate emails).
   - Triggers email verification on signup (`emailVerification.sendOnSignUp`).

The danger is silent privilege *escalation of an existing identity*. A public, account-creating signup that cannot touch existing accounts is not an escalation path.

---

### Rule 6 — Use timing-safe comparison for secrets (OWASP A02)

Never compare bearer tokens or HMAC digests with `===` or `!==`. Always use `timingSafeEqual` from Node's `crypto` module.

```ts
// ✅ correct
import { timingSafeEqual } from "node:crypto";

function isValidBearer(header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// ❌ wrong — susceptible to timing attacks
if (req.headers.get("authorization") !== `Bearer ${env.N8N_API_TOKEN}`) { ... }
```

---

## Checklist for new features

Before merging any PR that adds a new API route or tRPC procedure:

- [ ] Route handlers: session check is the **first** thing in the handler
- [ ] tRPC procedures: correct procedure type chosen (never `publicProcedure` for privileged actions)
- [ ] Any entity ID in `input` is filtered by `userId` / `instructorId` / `studentId` in the DB query
- [ ] Route handler `req.json()` body is parsed through a Zod schema before use
- [ ] File upload endpoints validate `file.type` against an allowlist
- [ ] Role *elevation* of existing accounts is behind `adminProcedure`/internal only; any public role-granting signup creates a new account and cannot touch existing ones
- [ ] Secret comparisons use `timingSafeEqual`

## Consequences

**Positive**
- Establishes a clear, reviewable security baseline for all contributors.
- Maps every rule to a concrete OWASP category, making review criteria unambiguous.

**Negative / Trade-offs**
- Adds a mandatory checklist step to PR reviews.
- Ownership checks add one extra DB round-trip per mutating handler; the latency is acceptable and necessary.