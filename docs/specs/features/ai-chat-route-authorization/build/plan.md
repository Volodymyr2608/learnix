# AI Chat Route Authorization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria.

**Goal:** Make it structurally impossible for an `app/api/chat/**` route to prove authorization
about one row and then act on another, and enforce that as a class-level invariant rather than three
individual patches.

**Architecture:** Two mechanisms, in this order of importance. (1) **Binding** — the route's access
check and its subject fetch become a single query, or the downstream identifiers are read off the
row the check returned; a second, independent lookup keyed by the raw request value is removed.
(2) **Validation** — a Zod schema on every chat route body makes a Prisma filter object
unrepresentable where an id is expected, and turns a `500` from deep in a stream callback into a
`400` at the edge. A contract test then prevents a fourth chat route shipping without (2).

**Tech Stack:** Next.js route handlers, Zod 4.3.6, Prisma, Vitest (integration against
`learnix_test`).

**Codebase anchors (verified during planning):**

- `app/api/chat/lesson/route.ts:34-58` — the two divergent queries: enrollment check by
  `studentId + lessons.some.id`, then an **independent** `lessonRepository.findFirst({ id: lessonId })`.
  `courseId`/`courseTitle` are read from the second result (`:133`, `:58`).
- `app/api/chat/learning-path/route.ts:18-26,49-52` — `courseId` read from `req.json()`, checked with
  `findByStudentCourse`, then the **raw request value** (not the enrollment's) passed to
  `streamRegenerate`.
- `server/repositories/enrollment.repository.ts:165-174` — `findByStudentCourse(studentId, courseId)`
  uses `include`, so the returned row carries the `courseId` scalar (`prisma/schema/enrollment.prisma:13`).
  This is the value the route must forward.
- `server/repositories/lesson.repository.ts:17-41` — `listOrderedWithConcepts(courseId)`:
  `db.section.findMany({ where: { courseId, deletedAt: null } })`. **`courseId` is the only scoping
  condition** — this is the single query in the learning-path flow that leaks across courses.
- `server/services/learningPathAI/nodes/loadStudentSignal.node.ts:21-28` — all five signal queries fire
  in one `Promise.all` **before** the enrollment re-check at `:34-43`, so the leaking read has already
  happened by the time that check runs.
- `server/services/courseAI/courseAI.service.ts:26-28` — `findFirst({ where: { id, instructorId } })`,
  one query carrying both conditions. This is the shape the other routes are being moved toward.
- `server/repositories/base/base.repository.ts:129-141` — `findFirst` passes `where` through to Prisma,
  adding only soft-delete via `buildWhere`. No implicit ownership scoping anywhere.
- `app/api/notifications/log/route.ts:5-26` — the in-repo route validation idiom: module-level schema
  + `safeParse` + early return.
- `server/services/_shared/aiGuard/entryPoints.contract.test.ts:9-16` — the `walk()` helper and
  filesystem-contract-test style Task 7 reuses.
- `app/api/chat/lesson/route.accessControl.integration.test.ts` — the existing probe. Tests 1-3 go
  through the route; **test 4 queries the repositories directly** and is rewritten in Task 3.
- Ids are `@default(cuid())` across the schema (`prisma/schema/lesson.prisma:2`,
  `course.prisma:7`, `enrollment.prisma:8`). Zod 4.3.6 exposes `z.cuid()`; the older
  `z.string().cuid()` still works but is the deprecated form — new code uses `z.cuid()`.

**Per-task conventions:** every task ends with `pnpm typecheck` and `pnpm check` clean, then a commit.
Integration tests are `*.integration.test.ts` and need the `learnix_test` DB up
(`docker-compose up -d`). Commit messages carry **no** `Co-Authored-By` trailer.

---

## Task 1: Reject non-string ids on the lesson route

Closes the cheapest path to the divergence and turns the current unhandled
`PrismaClientValidationError` (`500`) into a `400`. Test 3 of the existing probe file is already red
and becomes green here.

**Files:**
- Modify: `app/api/chat/lesson/route.ts:24-32`
- Test: `app/api/chat/lesson/route.accessControl.integration.test.ts` (existing, no edit needed)

- [ ] **Step 1: Confirm the failing test**

Run: `pnpm vitest run app/api/chat/lesson/route.accessControl.integration.test.ts`

Expected: FAIL — `rejects a Prisma filter object in place of a lesson id` throws
`PrismaClientValidationError` out of `saveMessage`. The two control tests pass.

- [ ] **Step 2: Add the schema**

In `app/api/chat/lesson/route.ts`, add the import and a module-level schema:

```ts
import { z } from "zod";

const LessonChatBodySchema = z.object({
	lessonId: z.cuid(),
	message: z.string().min(1),
});
```

Replace lines 24-28:

```ts
	const parsed = LessonChatBodySchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response("lessonId and message are required", { status: 400 });
	}
	const { lessonId, message } = parsed.data;
```

Leave the `validateMessageLength` check at `:30-32` exactly as it is — it returns `413`, a different
contract from the `400` above, and the length limit belongs to the rate limiter, not the shape.

- [ ] **Step 3: Run it, expect PASS**

Run: `pnpm vitest run app/api/chat/lesson/route.accessControl.integration.test.ts`

Expected: tests 1-3 PASS. Test 4 still FAILS — it queries the repositories directly and is rewritten
in Task 3. This task intentionally leaves that one test red.

- [ ] **Step 4: Check no other lesson-route test regressed**

Run: `pnpm vitest run app/api/chat/lesson/route.integration.test.ts`
Expected: all PASS.

- [ ] **Step 5: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "fix(chat): validate the lesson chat body with a schema

An unvalidated body let a Prisma filter object stand in for lessonId,
which Prisma accepts wherever a String id is expected. Rejects it at the
edge with 400 instead of a 500 thrown from inside the stream."
```

---

## Task 2: Collapse the lesson route's two queries into one

Task 1 closed the exploit; this closes the **structure** that produced it. A single enrollment-scoped
query means there is no second answer to disagree with, so acceptance criterion 5 (`courseId` passed
downstream equals the authorizing enrollment's `courseId`) holds by construction rather than by test.

**Files:**
- Modify: `app/api/chat/lesson/route.ts:34-58`, `:129-137`
- Test: `app/api/chat/lesson/route.integration.test.ts` (existing 403/404/200 coverage is the guard)

- [ ] **Step 1: Replace both queries with one**

Delete lines 34-58 (`enrollmentRepository.findFirst` … `const courseTitle = …`) and the
`lessonWithSection` cast, and put in their place:

```ts
	const enrollment = await enrollmentRepository.findFirst({
		where: {
			studentId: session.user.id,
			course: {
				sections: { some: { lessons: { some: { id: lessonId } } } },
			},
		},
		select: {
			courseId: true,
			course: {
				select: {
					title: true,
					sections: {
						select: {
							lessons: {
								where: { id: lessonId, deletedAt: null },
								select: { id: true, title: true },
							},
						},
					},
				},
			},
		},
	});
	if (!enrollment) {
		return new Response("Not enrolled", { status: 403 });
	}

	// The lesson is read out of the row that proved access, not fetched again by
	// the request's own id — so the query that authorizes and the query that acts
	// cannot resolve to different courses.
	const lesson = enrollment.course.sections.flatMap((s) => s.lessons)[0];
	if (!lesson) {
		return new Response("Lesson not found", { status: 404 });
	}

	const courseTitle = enrollment.course.title;
```

Note the `404` is still reachable: a soft-deleted lesson still satisfies the `some` filter in `where`
(which has no `deletedAt` condition), but is filtered out of the `select`, leaving an empty array.

- [ ] **Step 2: Forward the enrollment's courseId**

At the `streamResponse` call (was `:129-137`), replace `courseId: lessonWithSection.section.courseId`
with:

```ts
					courseId: enrollment.courseId,
```

Remove the now-unused `lessonRepository` import at `:3`.

- [ ] **Step 3: Run the route's tests, expect PASS**

Run: `pnpm vitest run app/api/chat/lesson/`
Expected: `route.integration.test.ts` fully PASS (403 / 404 / 200 behavior unchanged);
`route.accessControl.integration.test.ts` tests 1-3 PASS, test 4 still FAIL (rewritten next task).

- [ ] **Step 4: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "refactor(chat): resolve the lesson through the verified enrollment

The route proved access with one query and then fetched the lesson with a
second, independent one. One query now answers both, so the identifier that
authorizes the request is the identifier the tutor is built from."
```

---

## Task 3: Turn the probe into a regression test

The 4th test in the probe file reproduces the vulnerable query shapes directly, so it stays red no
matter what the route does. It served its purpose (proving the divergence exists) and is replaced by
a test of the invariant that now holds.

**Files:**
- Modify: `app/api/chat/lesson/route.accessControl.integration.test.ts:150-179`

- [ ] **Step 1: Replace the last test**

Delete the `the access check and the lesson fetch resolve to different courses` test and its imports
of `enrollmentRepository` / `lessonRepository` (lines 2-3), and add:

```ts
	// The invariant that replaces the probe: whatever course authorized the
	// request is the course the tutor is scoped to. Before the fix these came
	// from two independent queries and could disagree; now there is one query.
	it("scopes the tutor to the course that authorized the request", async () => {
		const res = await post(ownLessonId);

		expect(res.status).toBe(200);
		expect(capturedCalls).toEqual([
			{ lessonId: ownLessonId, courseId: ownCourseId },
		]);
	});
```

Capture `ownCourseId` in the fixture — add `let ownCourseId: string;` beside the other declarations
and `ownCourseId = courseA.id;` next to `ownLessonId = ownLesson.id;`.

- [ ] **Step 2: Tighten the existing control test**

The `control: allows the student's own lesson` test currently asserts `courseId: expect.any(String)`.
Change it to `courseId: ownCourseId` so no test in the file accepts an arbitrary course.

- [ ] **Step 3: Run it, expect PASS**

Run: `pnpm vitest run app/api/chat/lesson/route.accessControl.integration.test.ts`
Expected: 4 tests, all PASS.

- [ ] **Step 4: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "test(chat): assert the tutor is scoped to the authorizing course

Replaces the diagnostic probe, which asserted against the repositories
directly and could not go green through a route fix, with a test of the
invariant the fix establishes."
```

---

## Task 4: Prove the learning-path leak before fixing it

Д2's first test formulation was a false negative — the vulnerable path was never reached. Do not
repeat that here: establish the leak with a red test whose fixture reaches it, then fix.

The exploit needs the student enrolled in **two** courses: the check is
`findByStudentCourse(studentId, { not: A })`, which needs *some* non-A enrollment to match, and the
leak is `listOrderedWithConcepts` returning sections from every course except A.

**Files:**
- Create: `app/api/chat/learning-path/route.accessControl.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeSection,
	makeUser,
} from "@/test/factories";

const { mockGetSession, mockStreamRegenerate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockStreamRegenerate: vi.fn(),
}));

vi.mock("@/server/better-auth/server", () => ({ getSession: mockGetSession }));
vi.mock("@/server/services/learningPathAI/learningPathAI.service", () => ({
	learningPathAIService: { streamRegenerate: mockStreamRegenerate },
}));

const { POST } = await import("./route");

const capturedCourseIds: unknown[] = [];

/**
 * The lesson route's Д2 in its second form. `findByStudentCourse` binds
 * studentId and courseId in one query, so the *check* is sound — but the raw
 * request value, not the enrollment's courseId, is what flows into
 * streamRegenerate, where `listOrderedWithConcepts` scopes on courseId alone.
 */
describe("POST /api/chat/learning-path — access control on courseId", () => {
	let studentId: string;
	let courseAId: string;
	let unboughtCourseId: string;

	beforeEach(async () => {
		capturedCourseIds.length = 0;
		mockStreamRegenerate.mockReset();
		mockStreamRegenerate.mockImplementation(async function* (
			_studentId: string,
			courseId: unknown,
		) {
			capturedCourseIds.push(courseId);
			yield { type: "token" as const, value: "ok" };
		});

		const student = await makeUser({ role: "STUDENT" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });

		const courseA = await makeCourse({ instructorId: instructor.id });
		const sectionA = await makeSection({ courseId: courseA.id });
		await makeLesson({ sectionId: sectionA.id, title: "Bought A" });
		await makeEnrollment({ studentId: student.id, courseId: courseA.id });

		// A second, legitimate enrollment — this is what lets `{ not: A }` match
		// an enrollment at all, which is why a single-course fixture would have
		// produced a false negative.
		const courseB = await makeCourse({ instructorId: instructor.id });
		const sectionB = await makeSection({ courseId: courseB.id });
		await makeLesson({ sectionId: sectionB.id, title: "Bought B" });
		await makeEnrollment({ studentId: student.id, courseId: courseB.id });

		// Never bought. Its lesson titles must never reach this student.
		const courseC = await makeCourse({ instructorId: instructor.id });
		const sectionC = await makeSection({ courseId: courseC.id });
		await makeLesson({ sectionId: sectionC.id, title: "Never Bought" });

		studentId = student.id;
		courseAId = courseA.id;
		unboughtCourseId = courseC.id;

		mockGetSession.mockResolvedValue({
			user: { id: studentId, role: "STUDENT" },
		});
	});

	const post = (courseId: unknown) =>
		POST(
			new Request("http://localhost/api/chat/learning-path", {
				method: "POST",
				body: JSON.stringify({ courseId }),
			}),
		);

	it("control: rejects a course the student is not enrolled in", async () => {
		const res = await post(unboughtCourseId);

		expect(res.status).toBe(403);
		expect(capturedCourseIds).toEqual([]);
	});

	it("control: allows an enrolled course", async () => {
		const res = await post(courseAId);

		expect(res.status).toBe(200);
		expect(capturedCourseIds).toEqual([courseAId]);
	});

	it("rejects a Prisma filter object in place of a course id", async () => {
		const res = await post({ not: courseAId });

		expect(res.status).toBe(400);
		expect(capturedCourseIds).toEqual([]);
	});

	// Characterization, not a regression guard: this asserts what the repository
	// does with an unbound filter, and stays green after the fix. It is the
	// evidence for *why* the route may never forward an unvalidated value —
	// remove the validation and this is the data that escapes.
	it("hazard: listOrderedWithConcepts scopes on courseId alone", async () => {
		const rows = await lessonRepository.listOrderedWithConcepts({
			not: courseAId,
		} as unknown as string);

		expect(rows.map((r) => r.title)).toContain("Never Bought");
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run app/api/chat/learning-path/route.accessControl.integration.test.ts`

Expected: `rejects a Prisma filter object in place of a course id` FAILS — the route returns `200`
and `capturedCourseIds` contains the filter object. The `hazard` test PASSES, which is the proof the
`400` matters. If the filter test passes at this point, **stop and re-examine the fixture** — that is
the false-negative shape from Д2's first attempt.

- [ ] **Step 3: Commit the red test**

```bash
git commit -m "test(chat): prove the learning-path route forwards an unvalidated courseId"
```

---

## Task 5: Fix the learning-path route

**Files:**
- Modify: `app/api/chat/learning-path/route.ts:18-26`, `:49-52`

- [ ] **Step 1: Add the schema and forward the enrollment's courseId**

Add the import and schema:

```ts
import { z } from "zod";

const LearningPathChatBodySchema = z.object({
	courseId: z.cuid(),
});
```

Replace lines 18-21:

```ts
	const parsed = LearningPathChatBodySchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response("courseId is required", { status: 400 });
	}
	const { courseId } = parsed.data;
```

At the `streamRegenerate` call (was `:49-52`), forward the identifier that proved access:

```ts
				for await (const event of learningPathAIService.streamRegenerate(
					session.user.id,
					enrollment.courseId,
				)) {
```

- [ ] **Step 2: Run it, expect PASS**

Run: `pnpm vitest run app/api/chat/learning-path/`
Expected: all 4 tests PASS.

- [ ] **Step 3: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "fix(chat): validate and bind courseId on the learning-path route

The enrollment check bound studentId and courseId correctly, but the raw
request value flowed into streamRegenerate, where listOrderedWithConcepts
scopes on courseId alone and would return sections from every other course."
```

---

## Task 6: Schema for the course route

No divergence exists here — `getOrCreateCourseGeneration` filters `{ id, instructorId }` in one query
(`courseAI.service.ts:26-28`), so a filter object can only ever match the instructor's own rows. The
schema replaces an unsound `as` cast and, more importantly, removes the exemption Task 7 would
otherwise have to carve out.

**Files:**
- Modify: `app/api/chat/course/route.ts:30-42`
- Test: `app/api/chat/course/route.integration.test.ts` (existing coverage is the guard)

- [ ] **Step 1: Replace the cast with a schema**

```ts
import { z } from "zod";

const CourseChatBodySchema = z.object({
	courseGenerationId: z.cuid().optional(),
	userMessage: z.string().min(1).optional(),
	mode: z.enum(["chat", "finalize"]).optional(),
});
```

Replace lines 30-36 (`const body = (await req.json()) as { … }` through the `mode` assignment):

```ts
	const parsedBody = CourseChatBodySchema.safeParse(await req.json());
	if (!parsedBody.success) {
		return new Response("Invalid request body", { status: 400 });
	}
	const body = parsedBody.data;
	const { userMessage } = body;
	const mode: Mode = body.mode === "finalize" ? "finalize" : "chat";
```

The `mode` line is kept verbatim rather than folded into the schema default: it currently coerces
*any* unrecognized value to `"chat"`, and the schema now rejects unrecognized values outright, so
leaving it makes the change purely subtractive.

- [ ] **Step 2: Run the route's tests, expect PASS**

Run: `pnpm vitest run app/api/chat/course/`
Expected: all PASS — the `400` for a missing message at `:38-40` is unchanged for valid-shaped bodies.

- [ ] **Step 3: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "refactor(chat): validate the course chat body instead of casting it"
```

---

## Task 7: Contract test over every chat route

Turns three fixed files into an invariant. Mirrors `entryPoints.contract.test.ts`: it cannot catch a
logic error, but it makes "a new chat route shipped without validation" impossible to do quietly.

**Files:**
- Create: `app/api/chat/bodyValidation.contract.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "app/api/chat";
const READS_BODY = /req\.json\(\)/;
const VALIDATES = /safeParse\(|\.parse\(/;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
	});

describe("chat route body validation coverage", () => {
	it("every chat route that reads a body validates it with a schema", () => {
		const unvalidated = walk(join(process.cwd(), ROOT))
			.map((abs) => abs.slice(process.cwd().length + 1))
			.filter((rel) => {
				const source = readFileSync(rel, "utf-8");
				return READS_BODY.test(source) && !VALIDATES.test(source);
			});

		expect(unvalidated).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it, expect PASS**

Run: `pnpm vitest run app/api/chat/bodyValidation.contract.test.ts`
Expected: PASS — Tasks 1, 5 and 6 covered all three routes.

- [ ] **Step 3: Prove the test can fail**

Temporarily delete the `safeParse` line from `app/api/chat/lesson/route.ts`, re-run, and confirm the
test reports that file. Restore it. A contract test never verified against a red state is decoration.

- [ ] **Step 4: `pnpm typecheck` and `pnpm check` clean, then commit**

```bash
git commit -m "test(chat): fail when a chat route reads a body without validating it"
```

---

## Self-review (run before handoff)

**Spec coverage** — every Acceptance criterion mapped to a task:

| Acceptance criterion | Task |
|---|---|
| `{"lessonId": {"not": …}}` → `400`, no tutor built | 1 |
| that request is `4xx`, not an unhandled `500` | 1 |
| plain foreign lesson id → `403` | 1 (existing control test) |
| own lesson id → `200`, tutor built for that lesson | 1, 3 |
| `courseId` passed downstream == authorizing enrollment's `courseId` | 2 (by construction), 3 (asserted) |
| `{"courseId": {"not": …}}` on learning-path → `400`, no regeneration | 4, 5 |
| `{"courseGenerationId": {"not": …}}` on course → `400` | 6 |
| contract test fails on an unvalidated new chat route | 7 |

**Known gaps, deliberately left:**

- `enrollmentRepository.findFirst` in the lesson route does **not** filter enrollment `status`, so a
  `cancelled` enrollment still grants tutor access. `findByStudentCourse` (used by learning-path)
  *does* exclude cancelled. This asymmetry predates the feature and is out of scope here — changing it
  is a user-visible behavior change needing its own spec line. Record it at `/qa`.
- `lessonRepository.listOrderedWithConcepts` remains `courseId`-only scoped. Task 5 makes the route
  stop feeding it untrusted input, but the repository is still unsafe for any future caller. The
  `hazard` test in Task 4 documents this.

**Placeholder scan:** no `TBD`/`TODO`/"handle edge cases" in any code step — every step is complete
runnable code.

**Type consistency:** `enrollment.courseId` (not `lessonWithSection.section.courseId`) is the
identifier name used from Task 2 onward; `capturedCalls` / `capturedCourseIds` are the two distinct
spy arrays; `LessonChatBodySchema` / `LearningPathChatBodySchema` / `CourseChatBodySchema` are the
three schema names.

## Final verification

- `pnpm typecheck` — clean.
- `pnpm check` — clean.
- `pnpm test:unit` — green.
- `pnpm test:integration` — green (needs `docker-compose up -d`).
- Manual: as an enrolled student, open a lesson and send a message to the AI tutor — it answers, and
  the conversation persists across a reload. Regenerate a learning path on an enrolled course — it
  streams. Neither path regressed.
- At `/qa`: ADR required (this changes the authorization enforcement model) — candidate
  `docs/adr/023-chat-route-authorization-binding.md`, recording *why* binding is the control and
  validation only the cheap gate.