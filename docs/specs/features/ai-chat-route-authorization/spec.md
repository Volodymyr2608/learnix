---
feature: ai-chat-route-authorization
status: stable
models: []
depends-on: [ai-input-trust-boundary, auth]
---

## Purpose

The three AI chat routes under `app/api/chat/` are the only place in Learnix where a request body
reaches a Prisma query without passing through tRPC. tRPC procedures get input validation from their
Zod schema and role enforcement from the procedure type; these routes are plain
`export async function POST(req: Request)` handlers and get neither for free.

Today they read identifiers straight off `await req.json()` and hand them to Prisma untyped. Prisma
accepts a filter object (`{ not: "…" }`, `{ contains: "…" }`) wherever a `String` id is expected, so
an identifier the client controls can behave as a **query** rather than a **value**. Where a route
then proves access with one query and acts with a second, the two can resolve to different rows: the
check answers "yes" about a course the student paid for, and the action runs against a course they
did not.

This feature makes that class of divergence unrepresentable on every AI chat surface, and states the
invariant explicitly so a future route cannot reintroduce it quietly.

## Functional scope

**1. Every `app/api/chat/**` route validates its body against a Zod schema before any other work.**
Ids are `z.string().cuid()`, free text is `z.string().min(1)`. A body that fails validation is
rejected with `400` and a stable, non-echoing error — it never reaches a repository, a guard, or a
model call. Validation runs after authentication and rate limiting (an unauthenticated caller must
not be able to learn the shape of the schema) and before enrollment checks.

**2. Malformed input produces a `4xx`, never a `5xx`.** Parsing happens outside the
`ReadableStream`, so a rejected body returns an ordinary JSON response rather than an unhandled
exception thrown from a stream `start()` callback.

**3. The identifier that proves access is the identifier used downstream.** A route may not prove
authorization with one query and then re-derive the subject with an independent second query. Either
the access check and the fetch are the same query, or every downstream identifier is read off the
row the access check returned. Specifically:

- `lesson/route.ts` resolves the lesson **within the enrollment it just verified**, and takes
  `courseId` and `courseTitle` from that same result — not from a separate
  `lessonRepository.findFirst({ where: { id: lessonId } })`.
- `learning-path/route.ts` passes the `courseId` **off the verified enrollment row** into
  `learningPathAIService.streamRegenerate`, not the raw value from the request body.
- `course/route.ts` already satisfies this — `getOrCreateCourseGeneration` filters by
  `{ id, instructorId }` in one query, so check and fetch cannot disagree. Its untyped body cast is
  replaced with a schema for consistency, not because a divergence exists.

**4. A contract test enforces the class, not the instances.** A test walks `app/api/chat/**` and
fails when a route handler reads a request body without passing the result through a `*Schema`
parse. A new chat route cannot ship unvalidated, in the same way `entryPoints.contract.test.ts`
prevents a new AI surface shipping unregistered.

**5. The course route's body contract is narrower than it was.** `mode` outside
`"chat" | "finalize"` and an empty `userMessage` now return `400` where they were previously coerced
or allowed through. The only caller (`useChatStreaming.ts`) already satisfies the narrower contract.

**Out of scope:** authorization on tRPC procedures (covered by procedure types), the guard layers
themselves (`ai-input-trust-boundary`), rate-limit durability (tracked separately as Д6), and the
untrusted-content channels into the model context (Д1/Д3, tracked against
`ai-input-trust-boundary`).

## Acceptance criteria

- A student enrolled only in course A, posting `{"lessonId": {"not": "<their own lesson id>"}}` to
  `/api/chat/lesson`, receives `400` and no tutor is constructed — no `streamResponse` call is made
  for any lesson.
- The same request produces a `4xx` status, not an unhandled `PrismaClientValidationError` surfacing
  as `500`.
- A student posting a **plain** lesson id belonging to a course they are not enrolled in still
  receives `403`.
- A student posting their own lesson id still receives `200` and the tutor is built for that exact
  lesson and its real course — existing behavior is unchanged.
- A soft-deleted lesson in an enrolled course still returns `404`, not `403` or `200`.
- For any accepted `/api/chat/lesson` request, the `courseId` passed to `lessonAIService` equals the
  `courseId` of the enrollment that authorized the request. This holds **by construction** — one
  query answers both questions — and is observed by the `200` criterion above; it is deliberately not
  given a dedicated test, because once ids must be strings no black-box input can distinguish a bound
  route from an unbound one (see Agent notes).
- A student enrolled only in course A, posting `{"courseId": {"not": "<course A id>"}}` to
  `/api/chat/learning-path`, receives `400`, and no regeneration runs against any other course.
- An instructor posting `{"courseGenerationId": {"not": "…"}}` to `/api/chat/course` receives `400`
  rather than silently creating a new generation.
- The contract test fails when a new file under `app/api/chat/` calls `req.json()` without a Zod
  parse of the result.

## Agent notes

- **Why Zod alone is not the fix.** Type validation closes the cheapest path to the divergence, but
  the divergence is structural: two queries answering two different questions about one client-
  supplied value. A future refactor that reintroduces an independent second lookup would be exploitable
  again even with the schema in place. Criterion 5 (`courseId` equals the enrollment's `courseId`) is
  the one that pins the real invariant — keep it.
- **What is currently masking the bug.** The `lesson` route survives today only because
  `lessonAssistantRepository.saveMessage` uses `lessonId` inside the composite unique key
  `lessonId_studentId`, and Prisma rejects a non-scalar in that position. That is a coincidence of
  persistence ordering, not a control. Moving `saveMessage` after the stream, or changing that key,
  would make the leak live. Do not treat the existing `500` as evidence of safety.
- **`findFirst` has no `orderBy` here.** Which row an unbound filter lands on depends on physical row
  order, which is why the regression test in
  `app/api/chat/lesson/route.accessControl.integration.test.ts` creates the foreign course *first*
  and gives the enrolled course *two* lessons. A fixture that gets either detail wrong goes green
  without the vulnerability being fixed.
- The two red tests in that file predate this spec — they were written as a diagnostic probe under a
  one-off plan-gate exemption (ADR-021). Only one of them is a regression test: `rejects a Prisma
  filter object in place of a lesson id` goes through the route and goes green with the fix. The
  other, `the access check and the lesson fetch resolve to different courses`, asserts against the
  repositories directly and reproduces the vulnerable query shapes, so no route-level fix can turn it
  green — it proved the divergence exists and is then replaced by a test of the invariant.
- Reference pattern for route-level validation already in the repo:
  `app/api/notifications/log/route.ts` (`safeParse` + early return). Note that route parses into a
  variable first; the chat routes parse the body expression directly, which is what the contract test
  is written against.
- **Why there is no test for the binding invariant.** A lesson belongs to exactly one section, which
  belongs to exactly one course, so once `lessonId` must be a string the access check and the fetch
  cannot resolve to different courses — a test asserting they agree passes against the vulnerable
  code too. Review confirmed this empirically: an earlier version of that test passed with `route.ts`
  reverted to its pre-fix state. What enforces the binding is structural — one query, and no
  `lessonRepository` import in the route. If that import comes back, the binding is gone and no test
  will say so.
- New schemas use `z.cuid()` (the zod 4 spelling). Three older call sites in `server/entities/`
  still use the deprecated `z.string().cuid()`; `z.cuid()` is the canonical form for new code.
- `z.cuid()` is a format check, not an id validator — `"ccccccccc"` passes. That is sufficient here:
  the property being bought is "this is a string, not a Prisma filter object", not "this id exists".

**Known gaps, deliberately not closed here** (both confirmed by the `/qa` security audit):

- **Cancelled enrollments still grant lesson-AI access.** The lesson route's enrollment check filters
  no `status`, while `enrollmentRepository.findByStudentCourse` (used by learning-path) excludes
  `cancelled`. A student who unenrolled or was refunded keeps full tutor access to that course's
  content, at the platform's OpenAI cost. Severity Medium — a paywall bypass, not a cross-tenant
  leak, since the content is from a course they did once pay for. Closing it is a user-visible
  behavior change and needs its own spec line.
- **`learningPathAI/tools/getLessonSummary.tool.ts` takes `lessonId` as an LLM-settable argument
  with no ownership scoping at all** — unlike every other tool on this surface, which binds ids by
  closure. It is dead code today (no call sites, and the learning-path graph has no tool-calling
  node), so it is not reachable; wiring it up without adding a course scope would be an immediate
  cross-course content leak. Its sibling `getQuizAttemptHistory.tool.ts` has the milder version of
  the same shape (`studentId` is closure-bound, `lessonId` is not).