# Testing Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Vitest-based unit + integration test suite, a GitHub Actions deploy gate, and a fixed/expanded AI eval runner — covering the critical core-logic paths.

**Architecture:** Two Vitest projects (`unit`, no DB; `integration`, real Postgres `learnix_test`). Services bind to repository singletons that hit the real `db`, so integration tests cover service logic and `vi.mock` is reserved for fire-and-forget side effects. CI (GitHub Actions) runs typecheck + lint + tests on every PR as the deploy gate; Vercel deploys `main` after merge. Evals stay offline via `pnpm eval`.

**Tech Stack:** Vitest, @vitest/coverage-v8, vite-tsconfig-paths, dotenv, Prisma + Postgres (pgvector), tsx, GitHub Actions, LangSmith (existing evals).

Reference docs: `docs/adr/018-testing-strategy-ci.md`, `docs/specs/2026-05-24-testing-strategy/{requirements,plan,validation}.md`.

---

## File Structure

**New infra**
- `vitest.config.ts` — shared config (tsconfig paths plugin, coverage).
- `vitest.workspace.ts` — defines `unit` + `integration` projects.
- `.env.test.example` — committed; dummy values for all required env + test `DATABASE_URL`.
- `test/loadEnv.ts` — loads `.env.test` (no-op if absent); shared setup for both projects.
- `test/db.ts` — test Prisma client + `truncateAll()`.
- `test/factories.ts` — `makeUser`, `makeCourse`, `makeSection`, `makeLesson`, `makeEnrollment`.
- `test/setup.integration.ts` — env-name safety guard + `beforeEach(truncateAll)`.
- `.github/workflows/ci.yml` — quality + integration jobs.

**New unit tests** (colocated `*.test.ts`)
- `lib/utils/capitalize.test.ts`, `lib/utils/generateListWithIds.test.ts`, `lib/utils/doesPasswordMatch.test.ts`, `lib/utils/date/updatedLabel.test.ts`
- `lib/guards/isAbortError.test.ts`
- `server/services/quizAI/quizAI.validator.test.ts`
- `server/services/notifications/certificateToken.test.ts` (tests `signCertificateToken`/`verifyCertificateToken` from `auth.ts`)

**New integration tests** (`*.integration.test.ts`)
- `server/services/enrollment/enrollment.integration.test.ts`
- `server/services/course/course.integration.test.ts`
- `server/services/lesson/lessonProgress.integration.test.ts`
- `server/api/roleGuards.integration.test.ts`

**Eval changes**
- `evals/_shared/score.ts` (new) — `accuracyGate`.
- `evals/runEvals.ts` (modify) — run-all mode, new registrations, remove dead code.
- 4 existing `evals/courseAI/*.eval.ts` (modify) — use `accuracyGate`.
- `evals/lessonAI/tutor.eval.ts`, `evals/lessonInsightsAI/lessonInsights.eval.ts` (new) — wire orphan datasets.
- `evals/quizAI/quizGeneration.eval.ts` + `evals/datasets/quizAI/quizGeneration.jsonl` (new).
- `evals/learningPathAI/learningPath.eval.ts` + `evals/datasets/learningPathAI/learningPath.jsonl` (new).

**Modified**
- `package.json` — devDeps + scripts.
- `.gitignore` — already ignores `.env*.local`; add explicit `.env.test`.
- `CLAUDE.md` — Commands section.

---

## Task 1: Install Vitest and wire scripts

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.workspace.ts`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
pnpm add -D vitest @vitest/coverage-v8 vite-tsconfig-paths dotenv
```
Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		coverage: {
			provider: "v8",
			include: ["server/services/**", "lib/utils/**", "lib/guards/**"],
			reporter: ["text", "html"],
		},
	},
});
```

- [ ] **Step 3: Create `vitest.workspace.ts`**

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
	{
		extends: "./vitest.config.ts",
		test: {
			name: "unit",
			environment: "node",
			include: ["**/*.test.ts"],
			exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
			setupFiles: ["./test/loadEnv.ts"],
		},
	},
	{
		extends: "./vitest.config.ts",
		test: {
			name: "integration",
			environment: "node",
			include: ["**/*.integration.test.ts"],
			exclude: ["**/node_modules/**"],
			setupFiles: ["./test/loadEnv.ts", "./test/setup.integration.ts"],
			fileParallelism: false,
		},
	},
]);
```

- [ ] **Step 4: Add scripts to `package.json`**

Add these entries to the `"scripts"` object (after `"eval"`):
```json
"test": "vitest run",
"test:unit": "vitest run --project unit",
"test:integration": "vitest run --project integration",
"test:watch": "vitest",
"coverage": "vitest run --coverage",
```

- [ ] **Step 5: Verify the runner starts**

Run: `pnpm test:unit`
Expected: exits 0 with "No test files found" (no tests exist yet) — confirms config loads and the `@/` alias plugin is wired.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts vitest.workspace.ts
git commit -m "chore: add vitest with unit and integration projects"
```

---

## Task 2: Test harness — env loader, DB helper, factories

**Files:**
- Create: `.env.test.example`
- Create: `test/loadEnv.ts`
- Create: `test/db.ts`
- Create: `test/setup.integration.ts`
- Create: `test/factories.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.test.example`**

```bash
# Copy to .env.test and point DATABASE_URL at a throwaway DB named learnix_test.
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/learnix_test"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_SECRET="test-secret"
BETTER_AUTH_GITHUB_CLIENT_ID="test"
BETTER_AUTH_GITHUB_CLIENT_SECRET="test"
BETTER_AUTH_GOOGLE_CLIENT_ID="test"
BETTER_AUTH_GOOGLE_CLIENT_SECRET="test"
BASE_URL="http://localhost:3000"
OPENAI_API_KEY="test-openai-key"
RESEND_API_KEY="test-resend-key"
EMAIL_FROM_ADDRESS="test@example.com"
N8N_API_TOKEN="test"
N8N_WEBHOOK_BASE_URL="http://localhost:5678"
N8N_WEBHOOK_SECRET="test"
CERTIFICATE_SECRET="test-certificate-secret-at-least-32-chars-long"
UNSUBSCRIBE_SECRET="test-unsubscribe-secret"
```

- [ ] **Step 2: Add `.env.test` to `.gitignore`**

Append under the local env section (after line 42):
```
.env.test
```

- [ ] **Step 3: Create the local test DB and apply schema**

Run:
```bash
cp .env.test.example .env.test
docker compose exec postgres createdb -U "$DATABASE_USER" learnix_test || true
dotenv -e .env.test -- pnpm prisma migrate deploy
```
Expected: migrations apply to `learnix_test`, including the pgvector extension migration, with no error. (If `dotenv` CLI is unavailable, run `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/learnix_test pnpm prisma migrate deploy`.)

- [ ] **Step 4: Create `test/loadEnv.ts`**

```ts
import { config } from "dotenv";

// Loads .env.test for local runs. In CI the vars come from the job env,
// and dotenv silently does nothing when the file is absent.
config({ path: ".env.test" });
process.env.SKIP_ENV_VALIDATION ??= "true";
```

- [ ] **Step 5: Create `test/db.ts`**

```ts
import { PrismaClient } from "@/generated/prisma";

export const testDb = new PrismaClient();

const TABLES = [
	"LessonProgress",
	"CourseProgress",
	"Enrollment",
	"CourseReview",
	"Lesson",
	"Section",
	"CourseGenerationMessage",
	"CourseGeneration",
	"Course",
	"InstructorProfile",
	"Session",
	"Account",
	"User",
];

export async function truncateAll(): Promise<void> {
	const list = TABLES.map((t) => `"${t}"`).join(", ");
	await testDb.$executeRawUnsafe(
		`TRUNCATE ${list} RESTART IDENTITY CASCADE;`,
	);
}
```

> Note: if any table name above does not exist in the schema, remove it. Verify names against `prisma/schema/`. Embedding tables (`CourseEmbedding`, etc.) cascade from `Course`, so they need not be listed, but add them if FK cascade is not configured.

- [ ] **Step 6: Create `test/setup.integration.ts`**

```ts
import { afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./db";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("learnix_test")) {
	throw new Error(
		`Refusing to run integration tests: DATABASE_URL is not a learnix_test database (got "${url}"). Set up .env.test.`,
	);
}

beforeEach(async () => {
	await truncateAll();
});

afterAll(async () => {
	await testDb.$disconnect();
});
```

- [ ] **Step 7: Create `test/factories.ts`**

```ts
import { randomUUID } from "node:crypto";
import {
	CourseStatus,
	EnrollmentStatus,
	type Prisma,
	Role,
} from "@/generated/prisma";
import { testDb } from "./db";

export function makeUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
	return testDb.user.create({
		data: {
			id: randomUUID(),
			name: "Test User",
			email: `${randomUUID()}@example.com`,
			emailVerified: true,
			role: Role.STUDENT,
			...overrides,
		},
	});
}

export function makeCourse(overrides: Partial<Prisma.CourseUncheckedCreateInput> & { instructorId: string }) {
	return testDb.course.create({
		data: {
			title: "Test Course",
			slug: `course-${randomUUID()}`,
			status: CourseStatus.published,
			...overrides,
		},
	});
}

export function makeSection(overrides: Partial<Prisma.SectionUncheckedCreateInput> & { courseId: string }) {
	return testDb.section.create({
		data: { title: "Section 1", order: 0, ...overrides },
	});
}

export function makeLesson(overrides: Partial<Prisma.LessonUncheckedCreateInput> & { sectionId: string }) {
	return testDb.lesson.create({
		data: { title: "Lesson 1", order: 0, ...overrides },
	});
}

export function makeEnrollment(
	overrides: Partial<Prisma.EnrollmentUncheckedCreateInput> & {
		studentId: string;
		courseId: string;
	},
) {
	return testDb.enrollment.create({
		data: { status: EnrollmentStatus.active, ...overrides },
	});
}
```

> Note: field names (`slug`, `order`, etc.) must match `prisma/schema/`. Open the relevant `.prisma` files and adjust required fields before relying on these factories — add any non-nullable columns the schema demands.

- [ ] **Step 8: Sanity-check the harness**

Create a throwaway `test/sanity.integration.test.ts`:
```ts
import { expect, test } from "vitest";
import { makeUser } from "./factories";
import { testDb } from "./db";

test("factory inserts and truncation isolates", async () => {
	const user = await makeUser({ name: "Sanity" });
	const found = await testDb.user.findUnique({ where: { id: user.id } });
	expect(found?.name).toBe("Sanity");
});
```

Run: `pnpm test:integration`
Expected: PASS. Run it twice; second run still PASSES (truncation cleared the row), proving isolation.

- [ ] **Step 9: Delete the sanity test and commit**

```bash
rm test/sanity.integration.test.ts
git add .env.test.example .gitignore test/
git commit -m "chore: add integration test harness (db, factories, env guard)"
```

---

## Task 3: Unit tests — utilities

**Files:**
- Create: `lib/utils/capitalize.test.ts`
- Create: `lib/utils/generateListWithIds.test.ts`
- Create: `lib/utils/doesPasswordMatch.test.ts`
- Create: `lib/utils/date/updatedLabel.test.ts`
- Create: `lib/guards/isAbortError.test.ts`

- [ ] **Step 1: Write `lib/utils/capitalize.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { capitalize } from "./capitalize";

describe("capitalize", () => {
	it("uppercases the first character", () => {
		expect(capitalize("hello")).toBe("Hello");
	});
	it("returns empty string for null/undefined/empty", () => {
		expect(capitalize(null)).toBe("");
		expect(capitalize(undefined)).toBe("");
		expect(capitalize("")).toBe("");
	});
	it("leaves an already-capitalized string unchanged", () => {
		expect(capitalize("World")).toBe("World");
	});
});
```

- [ ] **Step 2: Write `lib/utils/generateListWithIds.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import generateListWithIds from "./generateListWithIds";

describe("generateListWithIds", () => {
	it("creates a list of the requested length with sequential ids", () => {
		expect(generateListWithIds(3)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
	});
	it("returns an empty array for count 0", () => {
		expect(generateListWithIds(0)).toEqual([]);
	});
});
```

- [ ] **Step 3: Write `lib/utils/doesPasswordMatch.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { doesPasswordMatch } from "./doesPasswordMatch";

describe("doesPasswordMatch", () => {
	it("returns true when passwords are identical", () => {
		expect(doesPasswordMatch({ password: "abc", confirmPassword: "abc" })).toBe(true);
	});
	it("returns false when passwords differ", () => {
		expect(doesPasswordMatch({ password: "abc", confirmPassword: "abd" })).toBe(false);
	});
});
```

- [ ] **Step 4: Write `lib/utils/date/updatedLabel.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import updatedLabel from "./updatedLabel";

describe("updatedLabel", () => {
	it("prefixes a relative distance with 'Updated' and a suffix", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
		const label = updatedLabel(tenMinutesAgo);
		expect(label).toMatch(/^Updated /);
		expect(label).toContain("ago");
	});
});
```

- [ ] **Step 5: Write `lib/guards/isAbortError.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isAbortError } from "./isAbortError";

describe("isAbortError", () => {
	it("returns true for an object with name AbortError", () => {
		expect(isAbortError({ name: "AbortError" })).toBe(true);
	});
	it("returns false for other errors and non-objects", () => {
		expect(isAbortError(new Error("nope"))).toBe(false);
		expect(isAbortError(null)).toBe(false);
		expect(isAbortError("AbortError")).toBe(false);
	});
});
```

- [ ] **Step 6: Run the unit tests**

Run: `pnpm test:unit`
Expected: all 5 files PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/*.test.ts lib/utils/date/*.test.ts lib/guards/*.test.ts
git commit -m "test: unit-test core utilities and guards"
```

---

## Task 4: Unit test — quizAI semantic validator

**Files:**
- Create: `server/services/quizAI/quizAI.validator.test.ts`

- [ ] **Step 1: Write the test**

`validateSemantics(questions)` returns `null` when valid, or an error string. Each question is `{ question, options (4), correct }`.

```ts
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "./schemas/quizOutput.schema";
import { validateSemantics } from "./quizAI.validator";

const q = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
	question: "What is 2+2?",
	options: ["3", "4", "5", "6"],
	correct: "4",
	...over,
});

describe("validateSemantics", () => {
	it("returns null for a valid question set", () => {
		expect(validateSemantics([q(), q({ question: "Capital of France?", options: ["A", "B", "Paris", "C"], correct: "Paris" })])).toBeNull();
	});
	it("flags a correct answer not present in options", () => {
		expect(validateSemantics([q({ correct: "42" })])).toMatch(/correct answer is not one of the options/);
	});
	it("flags duplicate options", () => {
		expect(validateSemantics([q({ options: ["4", "4", "5", "6"] })])).toMatch(/duplicate options/);
	});
	it("flags duplicate question text", () => {
		expect(validateSemantics([q(), q()])).toMatch(/Duplicate question text/);
	});
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:unit --project unit server/services/quizAI/quizAI.validator.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 3: Commit**

```bash
git add server/services/quizAI/quizAI.validator.test.ts
git commit -m "test: unit-test quizAI semantic validator"
```

---

## Task 5: Unit test — certificate token sign/verify

**Files:**
- Create: `server/services/notifications/certificateToken.test.ts`

The functions live in `server/services/notifications/auth.ts`: `signCertificateToken(enrollmentId)` and `verifyCertificateToken(token)`. They use `env.CERTIFICATE_SECRET` (HS256 via `jose`). `.env.test` provides the secret; `test/loadEnv.ts` runs first.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import {
	signCertificateToken,
	verifyCertificateToken,
} from "./auth";

describe("certificate token", () => {
	it("round-trips an enrollmentId", async () => {
		const token = await signCertificateToken("enr-123");
		const payload = await verifyCertificateToken(token);
		expect(payload.enrollmentId).toBe("enr-123");
	});

	it("rejects a tampered token", async () => {
		const token = await signCertificateToken("enr-123");
		const tampered = `${token.slice(0, -2)}xy`;
		await expect(verifyCertificateToken(tampered)).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test:unit --project unit server/services/notifications/certificateToken.test.ts`
Expected: PASS. If it throws on import about missing env, confirm `.env.test` has `CERTIFICATE_SECRET` and `test/loadEnv.ts` is in the unit project `setupFiles`.

- [ ] **Step 3: Commit**

```bash
git add server/services/notifications/certificateToken.test.ts
git commit -m "test: unit-test certificate token sign/verify"
```

---

## Task 6: Integration test — EnrollmentService

**Files:**
- Create: `server/services/enrollment/enrollment.integration.test.ts`

Targets `enrollInCourse(studentId, courseId)`: rejects own-course (`BAD_REQUEST`), creates enrollment, re-activates a cancelled one, and triggers `embeddingsService.recomputeUserInterest`. Mock the embeddings module so no OpenAI call happens.

- [ ] **Step 1: Write the test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus, Role } from "@/generated/prisma";
import { makeCourse, makeUser } from "@/test/factories";
import { testDb } from "@/test/db";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: vi.fn().mockResolvedValue(undefined) },
}));

const { enrollmentService } = await import("./enrollment.service");
const { embeddingsService } = await import("@/server/services/embeddings/embeddings.service");

describe("EnrollmentService.enrollInCourse", () => {
	beforeEach(() => vi.clearAllMocks());

	it("enrolls a student in a published course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id, status: "published" });

		await enrollmentService.enrollInCourse(student.id, course.id);

		const enrollment = await testDb.enrollment.findFirst({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(enrollment?.status).toBe(EnrollmentStatus.active);
	});

	it("rejects enrolling in your own course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: instructor.id, status: "published" });

		await expect(
			enrollmentService.enrollInCourse(instructor.id, course.id),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("re-activates a cancelled enrollment without creating a duplicate", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id, status: "published" });
		await testDb.enrollment.create({
			data: { studentId: student.id, courseId: course.id, status: EnrollmentStatus.cancelled },
		});

		await enrollmentService.enrollInCourse(student.id, course.id);

		const rows = await testDb.enrollment.findMany({
			where: { studentId: student.id, courseId: course.id },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe(EnrollmentStatus.active);
	});

	it("triggers a user-interest recompute on enrollment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id, status: "published" });

		await enrollmentService.enrollInCourse(student.id, course.id);
		await vi.waitFor(() =>
			expect(embeddingsService.recomputeUserInterest).toHaveBeenCalledWith(student.id),
		);
	});
});
```

> Note: `EnrollmentStatus.cancelled` — confirm the actual enum member name in `prisma/schema/` (could be `cancelled`/`canceled`/`inactive`). Adjust. The recompute is fire-and-forget (`void (async () => …)`), hence `vi.waitFor`.

- [ ] **Step 2: Run and verify it passes**

Run: `pnpm test:integration server/services/enrollment/enrollment.integration.test.ts`
Expected: 4 PASS. If the own-course assertion fails on error shape, inspect the thrown `EnrollmentError` (`code` property from `DomainError`).

- [ ] **Step 3: Commit**

```bash
git add server/services/enrollment/enrollment.integration.test.ts
git commit -m "test: integration-test enrollment service critical paths"
```

---

## Task 7: Integration test — CourseService publish hook

**Files:**
- Create: `server/services/course/course.integration.test.ts`

Targets the publish path of `CourseService.updateCourse` (or the publish method — open `server/services/course/course.service.ts` and use the actual method that transitions status to `published`). Asserts status change and that `embeddingsService.embedCourse` fires.

- [ ] **Step 1: Inspect the service**

Run: `grep -n "async \|embedCourse\|status" server/services/course/course.service.ts | head -40`
Identify the method that publishes a course and its signature. Use that method name in the test below (the placeholder `updateCourse` must be replaced with the real one).

- [ ] **Step 2: Write the test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { makeCourse, makeUser } from "@/test/factories";
import { testDb } from "@/test/db";

vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		embedCourse: vi.fn().mockResolvedValue(undefined),
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

const { courseService } = await import("./course.service");
const { embeddingsService } = await import("@/server/services/embeddings/embeddings.service");

describe("CourseService publish", () => {
	beforeEach(() => vi.clearAllMocks());

	it("transitions a draft course to published and triggers embedding", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: instructor.id, status: "draft" });

		// Replace with the real publish call + arguments from Step 1:
		await courseService.updateCourse(instructor.id, course.id, { status: "published" });

		const updated = await testDb.course.findUnique({ where: { id: course.id } });
		expect(updated?.status).toBe("published");
		await vi.waitFor(() => expect(embeddingsService.embedCourse).toHaveBeenCalled());
	});
});
```

> Note: `CourseStatus` enum values — confirm `draft`/`published` spelling in `prisma/schema/`. Replace `updateCourse(...)` with the real method/signature found in Step 1.

- [ ] **Step 3: Run and verify it passes**

Run: `pnpm test:integration server/services/course/course.integration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/services/course/course.integration.test.ts
git commit -m "test: integration-test course publish + embedding hook"
```

---

## Task 8: Integration test — lesson progress

**Files:**
- Create: `server/services/lesson/lessonProgress.integration.test.ts`

Targets `LessonService.markLessonComplete(lessonId, studentId)` (upserts `LessonProgress.isCompleted = true`, `server/services/lesson/lesson.service.ts:151`) and `markLessonIncomplete`. Asserts the progress row state and idempotency.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { makeCourse, makeLesson, makeSection, makeUser } from "@/test/factories";
import { testDb } from "@/test/db";

const { lessonService } = await import("./lesson.service");

async function seedLesson() {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	const student = await makeUser({ role: Role.STUDENT });
	const course = await makeCourse({ instructorId: instructor.id, status: "published" });
	const section = await makeSection({ courseId: course.id });
	const lesson = await makeLesson({ sectionId: section.id });
	return { student, lesson };
}

describe("LessonService progress", () => {
	it("marks a lesson complete (idempotent)", async () => {
		const { student, lesson } = await seedLesson();

		await lessonService.markLessonComplete(lesson.id, student.id);
		await lessonService.markLessonComplete(lesson.id, student.id);

		const rows = await testDb.lessonProgress.findMany({
			where: { lessonId: lesson.id, studentId: student.id },
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.isCompleted).toBe(true);
		expect(rows[0]?.completedAt).not.toBeNull();
	});

	it("marks a previously completed lesson incomplete", async () => {
		const { student, lesson } = await seedLesson();
		await lessonService.markLessonComplete(lesson.id, student.id);

		await lessonService.markLessonIncomplete(lesson.id, student.id);

		const row = await testDb.lessonProgress.findFirst({
			where: { lessonId: lesson.id, studentId: student.id },
		});
		expect(row?.isCompleted).toBe(false);
	});
});
```

> Note: confirm `markLessonComplete`/`markLessonIncomplete` are exported on the `lessonService` singleton and their argument order matches (`lessonId`, `studentId`). Open `server/services/lesson/lesson.service.ts` lines ~151 and ~251.

- [ ] **Step 2: Run and verify it passes**

Run: `pnpm test:integration server/services/lesson/lessonProgress.integration.test.ts`
Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add server/services/lesson/lessonProgress.integration.test.ts
git commit -m "test: integration-test lesson progress complete/incomplete"
```

---

## Task 9: Integration test — role-gated procedures

**Files:**
- Create: `server/api/roleGuards.integration.test.ts`

Verifies `roleProcedure` enforcement using a tiny router built from the exported procedures and `createCallerFactory`. No DB rows needed — fabricate the session context. Lives in the integration project because it imports the full tRPC context module (which pulls env/better-auth).

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import {
	adminProcedure,
	createCallerFactory,
	createTRPCRouter,
	instructorProcedure,
	studentProcedure,
} from "@/server/api/trpc";

const testRouter = createTRPCRouter({
	studentOnly: studentProcedure.query(() => "student-ok"),
	instructorOnly: instructorProcedure.query(() => "instructor-ok"),
	adminOnly: adminProcedure.query(() => "admin-ok"),
});

const createCaller = createCallerFactory(testRouter);

function ctxForRole(role: Role | null) {
	return {
		db: testDb,
		headers: new Headers(),
		session: role
			? { user: { id: "u1", role }, session: { id: "s1" } }
			: null,
	} as never;
}

describe("role-gated procedures", () => {
	it("allows the matching role and returns the value", async () => {
		const caller = createCaller(ctxForRole(Role.STUDENT));
		await expect(caller.studentOnly()).resolves.toBe("student-ok");
	});

	it("rejects a mismatched role with FORBIDDEN", async () => {
		const caller = createCaller(ctxForRole(Role.STUDENT));
		await expect(caller.instructorOnly()).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects an unauthenticated caller with UNAUTHORIZED", async () => {
		const caller = createCaller(ctxForRole(null));
		await expect(caller.adminOnly()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
```

> Note: the `session` shape only needs `user.role` for the guard (`server/api/trpc.ts:149`). If TypeScript complains about the fabricated context, the `as never` cast keeps the test focused on runtime behavior.

- [ ] **Step 2: Run and verify it passes**

Run: `pnpm test:integration server/api/roleGuards.integration.test.ts`
Expected: 3 PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/roleGuards.integration.test.ts
git commit -m "test: integration-test role-gated trpc procedures"
```

---

## Task 10: CI workflow — GitHub Actions deploy gate

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.4.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm generate
      - run: pnpm typecheck
        env:
          SKIP_ENV_VALIDATION: "true"
      - run: pnpm check
      - run: pnpm test:unit
        env:
          SKIP_ENV_VALIDATION: "true"
          CERTIFICATE_SECRET: test-certificate-secret-at-least-32-chars-long

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: learnix_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/learnix_test
      SKIP_ENV_VALIDATION: "true"
      CERTIFICATE_SECRET: test-certificate-secret-at-least-32-chars-long
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.4.1
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm generate
      - run: pnpm prisma migrate deploy
      - run: pnpm test:integration
```

> Note: `pnpm generate` runs `prisma generate` so the `@/generated/prisma` client exists in CI (it is gitignored). The pgvector image matches the dev/prod DB image (`pg16`).

- [ ] **Step 2: Validate YAML syntax**

Run: `pnpm dlx yaml-lint .github/workflows/ci.yml` (or open in the IDE — confirm no parse errors).
Expected: no errors.

- [ ] **Step 3: Commit and push to a branch, open a PR**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add github actions test gate (typecheck, lint, unit, integration)"
git push -u origin feat/testing
```

- [ ] **Step 4: Verify on the PR**

Open the PR and confirm both `quality` and `integration` jobs run and pass. Then push a commit with a deliberately broken assertion in one unit test, confirm the check goes red, and revert it.

- [ ] **Step 5: Enable branch protection (manual, repo setting)**

In GitHub repo Settings → Branches → add a rule for `main` requiring the `quality` and `integration` checks. Document this in the PR description (not code).

---

## Task 11: Eval shared scorer + run-all mode

**Files:**
- Create: `evals/_shared/score.ts`
- Modify: `evals/runEvals.ts`
- Modify: `evals/courseAI/classifyIntent.eval.ts` (and the other three)

- [ ] **Step 1: Create `evals/_shared/score.ts`**

```ts
export type EvalResult = { id: string; ok: boolean };

export function accuracyGate(
	label: string,
	results: EvalResult[],
	threshold: number,
): boolean {
	const passed = results.filter((r) => r.ok).length;
	const accuracy = results.length ? passed / results.length : 0;
	console.log(`${label} accuracy: ${(accuracy * 100).toFixed(1)}% (${passed}/${results.length})`);
	const failures = results.filter((r) => !r.ok).map((r) => r.id);
	if (failures.length) console.log(`${label} failures:`, failures);
	if (accuracy < threshold) {
		console.error(`FAIL: ${label} accuracy below ${threshold} threshold`);
		return false;
	}
	return true;
}
```

- [ ] **Step 2: Refactor `evals/courseAI/classifyIntent.eval.ts` to use it**

Replace the tail of the file (the manual accuracy block and `void evaluate`) so the function returns a boolean and uses `accuracyGate`:
```ts
import { accuracyGate, type EvalResult } from "../_shared/score";
// ...remove: import { evaluate } from "langsmith/evaluation";

export async function runClassifyIntentEval(): Promise<boolean> {
	const data = loadDataset();
	const results: EvalResult[] = await Promise.all(
		data.map(async (row) => {
			const out = await classifyIntent({ /* unchanged state object */ });
			const ok =
				out.intent === row.expected.intent &&
				(out.reviseTarget ?? null) ===
					(row.expected.reviseTarget ? DraftStep[row.expected.reviseTarget] : null);
			return { id: row.id, ok };
		}),
	);
	return accuracyGate("classifyIntent", results, 0.85);
}
```
Apply the same shape (return `boolean`, use `accuracyGate`, drop `process.exit`/`void evaluate`) to `confidenceScore.eval.ts`, `extractStepData.eval.ts`, `assessCompletion.eval.ts`, preserving each file's existing scoring logic and threshold.

- [ ] **Step 3: Rewrite `evals/runEvals.ts` for run-all mode**

```ts
import { runAssessCompletionEval } from "./courseAI/assessCompletion.eval";
import { runClassifyIntentEval } from "./courseAI/classifyIntent.eval";
import { runConfidenceScoreEval } from "./courseAI/confidenceScore.eval";
import { runExtractStepDataEval } from "./courseAI/extractStepData.eval";

const EVALS: Record<string, () => Promise<boolean>> = {
	"courseAI:classifyIntent": runClassifyIntentEval,
	"courseAI:assessCompletion": runAssessCompletionEval,
	"courseAI:extractStepData": runExtractStepDataEval,
	"courseAI:confidenceScore": runConfidenceScoreEval,
};

async function main() {
	const which = process.argv[2];

	if (which && !(which in EVALS)) {
		console.log("Unknown eval:", which);
		console.log("Available:", Object.keys(EVALS).join(", "));
		process.exit(1);
	}

	const names = which ? [which] : Object.keys(EVALS);
	let allPassed = true;
	for (const name of names) {
		console.log(`\n=== ${name} ===`);
		const passed = await EVALS[name]!();
		allPassed &&= passed;
	}
	if (!allPassed) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
```

- [ ] **Step 4: Run a single eval and the run-all**

Run: `pnpm eval courseAI:classifyIntent` then `pnpm eval`
Expected: single prints one accuracy line; no-arg runs all four sequentially and exits 0 if all above threshold. (Requires `OPENAI_API_KEY` in `.env.local`.)

- [ ] **Step 5: Commit**

```bash
git add evals/_shared/score.ts evals/runEvals.ts evals/courseAI/*.eval.ts
git commit -m "test: add eval run-all mode and shared accuracy scorer"
```

---

## Task 12: Wire orphaned eval datasets (tutor, lessonInsights)

**Files:**
- Create: `evals/lessonAI/tutor.eval.ts`
- Create: `evals/lessonInsightsAI/lessonInsights.eval.ts`
- Modify: `evals/runEvals.ts`

- [ ] **Step 1: Inspect the services to call**

Run:
```bash
grep -n "export\|async \|class " server/services/lessonAI/lessonAI.service.ts | head
grep -n "export\|async \|class " server/services/lessonInsightsAI/lessonInsightsAI.service.ts | head
```
Identify the public method for asking the tutor (returns answer + tool calls) and for generating insights (summary/concepts/glossary). Use the real method names/signatures in the eval below.

- [ ] **Step 2: Create `evals/lessonInsightsAI/lessonInsights.eval.ts`**

Dataset row shape (`evals/datasets/lessonInsights.jsonl`): `{ input: { content }, expected: { summary_contains[], concepts_min, glossary_min } }`.
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accuracyGate, type EvalResult } from "../_shared/score";
import { lessonInsightsAIService } from "@/server/services/lessonInsightsAI/lessonInsightsAI.service";

type Row = {
	input: { content: string };
	expected: { summary_contains: string[]; concepts_min: number; glossary_min: number };
};

const DATASET = resolve(process.cwd(), "evals/datasets/lessonInsights.jsonl");
const load = (): Row[] =>
	readFileSync(DATASET, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

export async function runLessonInsightsEval(): Promise<boolean> {
	const rows = load();
	const results: EvalResult[] = await Promise.all(
		rows.map(async (row, i) => {
			// Replace with the real insights method + return shape from Step 1:
			const out = await lessonInsightsAIService.generateInsights(row.input.content);
			const summary = (out.summary ?? "").toLowerCase();
			const ok =
				row.expected.summary_contains.every((k) => summary.includes(k.toLowerCase())) &&
				(out.concepts?.length ?? 0) >= row.expected.concepts_min &&
				(out.glossary?.length ?? 0) >= row.expected.glossary_min;
			return { id: `lessonInsights-${i}`, ok };
		}),
	);
	return accuracyGate("lessonInsights", results, 0.8);
}
```
> Replace `generateInsights` and the `summary`/`concepts`/`glossary` field names with the real ones found in Step 1.

- [ ] **Step 3: Create `evals/lessonAI/tutor.eval.ts`**

Dataset row shape (`evals/datasets/tutor.jsonl`): `{ input: { lessonTitle, question }, expected: { tools_called[], answer_contains[] } }`.
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accuracyGate, type EvalResult } from "../_shared/score";
import { lessonAIService } from "@/server/services/lessonAI/lessonAI.service";

type Row = {
	input: { lessonTitle: string; question: string };
	expected: { tools_called: string[]; answer_contains: string[] };
};

const DATASET = resolve(process.cwd(), "evals/datasets/tutor.jsonl");
const load = (): Row[] =>
	readFileSync(DATASET, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

export async function runTutorEval(): Promise<boolean> {
	const rows = load();
	const results: EvalResult[] = await Promise.all(
		rows.map(async (row, i) => {
			// Replace with the real tutor method + return shape from Step 1:
			const out = await lessonAIService.ask(row.input);
			const answer = (out.answer ?? "").toLowerCase();
			const ok = row.expected.answer_contains.every((k) => answer.includes(k.toLowerCase()));
			return { id: `tutor-${i}`, ok };
		}),
	);
	return accuracyGate("tutor", results, 0.7);
}
```
> Replace `lessonAIService.ask(...)` and the return shape with the real method from Step 1. If the method exposes tool-call names, also assert `tools_called`; otherwise judge `answer_contains` only and note the limitation in the dataset.

- [ ] **Step 4: Register both in `evals/runEvals.ts`**

Add imports and entries to the `EVALS` map:
```ts
import { runTutorEval } from "./lessonAI/tutor.eval";
import { runLessonInsightsEval } from "./lessonInsightsAI/lessonInsights.eval";
// ...
	"lessonAI:tutor": runTutorEval,
	"lessonInsightsAI:insights": runLessonInsightsEval,
```

- [ ] **Step 5: Run them**

Run: `pnpm eval lessonInsightsAI:insights` then `pnpm eval lessonAI:tutor`
Expected: each prints an accuracy line.

- [ ] **Step 6: Commit**

```bash
git add evals/lessonAI/tutor.eval.ts evals/lessonInsightsAI/lessonInsights.eval.ts evals/runEvals.ts
git commit -m "test: wire tutor and lessonInsights evals into runner"
```

---

## Task 13: New evals — quizAI and learningPathAI

**Files:**
- Create: `evals/datasets/quizAI/quizGeneration.jsonl`
- Create: `evals/quizAI/quizGeneration.eval.ts`
- Create: `evals/datasets/learningPathAI/learningPath.jsonl`
- Create: `evals/learningPathAI/learningPath.eval.ts`
- Modify: `evals/runEvals.ts`

- [ ] **Step 1: Inspect the two services**

Run:
```bash
grep -n "export\|async \|class " server/services/quizAI/quizAI.service.ts | head
grep -n "export\|async \|class " server/services/learningPathAI/learningPathAI.service.ts | head
```
Identify the generation method names/signatures and return shapes.

- [ ] **Step 2: Create `evals/datasets/quizAI/quizGeneration.jsonl`**

Three rows; each provides lesson content and expectations. Validity is judged by `QuizOutputSchema` (3–5 questions, 4 options each, correct ∈ options) plus `validateSemantics`.
```jsonl
{"id":"quiz-hooks","input":{"lessonTitle":"React Hooks","content":"useState returns a stateful value and a setter. useEffect runs side effects after render. Hooks must be called at the top level."},"expected":{"min_questions":3}}
{"id":"quiz-async","input":{"lessonTitle":"Async JS","content":"async functions return promises. await pauses until a promise settles. try/catch handles rejection."},"expected":{"min_questions":3}}
{"id":"quiz-css","input":{"lessonTitle":"Flexbox","content":"display:flex creates a flex container. justify-content aligns on the main axis. align-items aligns on the cross axis."},"expected":{"min_questions":3}}
```

- [ ] **Step 3: Create `evals/quizAI/quizGeneration.eval.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accuracyGate, type EvalResult } from "../_shared/score";
import { QuizOutputSchema } from "@/server/services/quizAI/schemas/quizOutput.schema";
import { validateSemantics } from "@/server/services/quizAI/quizAI.validator";
import { quizAIService } from "@/server/services/quizAI/quizAI.service";

type Row = {
	id: string;
	input: { lessonTitle: string; content: string };
	expected: { min_questions: number };
};

const DATASET = resolve(process.cwd(), "evals/datasets/quizAI/quizGeneration.jsonl");
const load = (): Row[] =>
	readFileSync(DATASET, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

export async function runQuizGenerationEval(): Promise<boolean> {
	const rows = load();
	const results: EvalResult[] = await Promise.all(
		rows.map(async (row) => {
			// Replace with the real generation method + args from Step 1:
			const out = await quizAIService.generateQuiz(row.input);
			const parsed = QuizOutputSchema.safeParse(out);
			const semanticError = parsed.success ? validateSemantics(parsed.data.questions) : "schema fail";
			const ok =
				parsed.success &&
				semanticError === null &&
				parsed.data.questions.length >= row.expected.min_questions;
			return { id: row.id, ok };
		}),
	);
	return accuracyGate("quizAI:generation", results, 0.8);
}
```
> Replace `quizAIService.generateQuiz(row.input)` with the real method/signature. If the service returns a wrapper (e.g. `{ questions }`), unwrap before `safeParse`.

- [ ] **Step 4: Create `evals/datasets/learningPathAI/learningPath.jsonl`**

```jsonl
{"id":"path-frontend","input":{"goal":"Become a frontend developer","knownTopics":["HTML","CSS"]},"expected":{"min_steps":3,"should_include":["JavaScript"]}}
{"id":"path-data","input":{"goal":"Learn data analysis with Python","knownTopics":[]},"expected":{"min_steps":3,"should_include":["Python"]}}
```

- [ ] **Step 5: Create `evals/learningPathAI/learningPath.eval.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accuracyGate, type EvalResult } from "../_shared/score";
import { learningPathAIService } from "@/server/services/learningPathAI/learningPathAI.service";

type Row = {
	id: string;
	input: { goal: string; knownTopics: string[] };
	expected: { min_steps: number; should_include: string[] };
};

const DATASET = resolve(process.cwd(), "evals/datasets/learningPathAI/learningPath.jsonl");
const load = (): Row[] =>
	readFileSync(DATASET, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row);

export async function runLearningPathEval(): Promise<boolean> {
	const rows = load();
	const results: EvalResult[] = await Promise.all(
		rows.map(async (row) => {
			// Replace with the real method + return shape from Step 1:
			const out = await learningPathAIService.generatePath(row.input);
			const steps = out.steps ?? [];
			const text = JSON.stringify(steps).toLowerCase();
			const ok =
				steps.length >= row.expected.min_steps &&
				row.expected.should_include.every((k) => text.includes(k.toLowerCase()));
			return { id: row.id, ok };
		}),
	);
	return accuracyGate("learningPathAI:path", results, 0.7);
}
```
> Replace `learningPathAIService.generatePath(...)` and `out.steps` with the real method/return shape from Step 1.

- [ ] **Step 6: Register both in `evals/runEvals.ts`**

```ts
import { runQuizGenerationEval } from "./quizAI/quizGeneration.eval";
import { runLearningPathEval } from "./learningPathAI/learningPath.eval";
// ...
	"quizAI:generation": runQuizGenerationEval,
	"learningPathAI:path": runLearningPathEval,
```

- [ ] **Step 7: Run them and the full suite**

Run: `pnpm eval quizAI:generation` then `pnpm eval learningPathAI:path` then `pnpm eval`
Expected: each prints accuracy; `pnpm eval` runs all six registered evals.

- [ ] **Step 8: Commit**

```bash
git add evals/quizAI/ evals/learningPathAI/ evals/datasets/quizAI/ evals/datasets/learningPathAI/ evals/runEvals.ts
git commit -m "test: add quizAI and learningPathAI evals with golden datasets"
```

---

## Task 14: Docs — update CLAUDE.md commands

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add test commands**

In the Commands code block (after `pnpm check:unsafe`), add:
```bash
pnpm test            # Run all tests (unit + integration)
pnpm test:unit       # Unit tests only (no DB)
pnpm test:integration # Integration tests (requires .env.test → learnix_test DB)
pnpm coverage        # Vitest coverage report
```

- [ ] **Step 2: Add a testing note**

After the "Pre-commit hook" line, replace "No test suite is configured." with:
```
**Testing**: Vitest with two projects — `unit` (pure functions, no DB) and `integration` (services/repositories against a real `learnix_test` Postgres). CI (`.github/workflows/ci.yml`) gates PRs. AI evals run via `pnpm eval` (offline, see ADR-013/ADR-018).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document test commands and testing strategy in CLAUDE.md"
```

---

## Self-Review Notes

- **Spec coverage:** FR-1/2 (Task 1), FR-3/4/5/6 (Task 2), FR-7 (Task 3), FR-8 (Task 4), FR-12 (Task 5 — implemented as a unit test since token logic is pure, as allowed by spec plan.md Step 4), FR-9 (Task 6), FR-10 (Task 7), FR-11 (Task 8), FR-13 (Task 9), FR-14/15/16/17 (Task 10), FR-18/21 (Task 11), FR-19 (Task 12), FR-20 (Task 13). Docs (Task 14).
- **Schema-dependent placeholders are intentional and flagged:** factory field names, enum member spellings (`EnrollmentStatus`, `CourseStatus`), and the exact public method names of `courseService`/`lessonAIService`/`lessonInsightsAIService`/`quizAIService`/`learningPathAIService` must be confirmed against source during implementation (each such step includes a `grep`/inspect step first). These are not optional fill-ins — the surrounding code is complete; only the project-specific identifier is to be verified.
- **Type consistency:** `EvalResult`/`accuracyGate` (Task 11) are reused unchanged in Tasks 12–13. Eval functions uniformly return `Promise<boolean>`; `runEvals.ts` map is typed `Record<string, () => Promise<boolean>>`.
- **pg16** used in CI to match the dev/prod `pgvector/pgvector:pg16` image (ADR-018 said pg17 as an example; pg16 is correct here).
```