# Account Deletion & Data Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax. See [`../spec.md`](../spec.md) for the design and Acceptance criteria.

**Goal:** Replace destructive account deletion with irreversible anonymise-in-place, so that erasing
one person's identity never destroys another person's data, financial records, or certificates.

**Architecture:** "Delete my account" stops removing the `User` row. Better Auth's existing flow is
kept end to end — password re-verification, token, confirmation email, callback, redirect — and only
its final `DELETE FROM users` is intercepted. Two hooks do it: `user.deleteUser.beforeDelete` runs one
Prisma interactive transaction that destroys credentials and privately-authored content, scrubs the
free-text fields of `InstructorProfile`, and overwrites `name` / `email` / `image`; then
`databaseHooks.user.delete.before` returns `false`, which makes Better Auth skip the row delete
entirely. Separately, every relation on the `User → retained data` path is downgraded
`Cascade → Restrict` so a future direct `user.delete()` fails loudly instead of silently erasing a
paid course.

**Tech Stack:** Prisma 6 (PostgreSQL), Better Auth 1.5.4, tRPC v11, Next.js 16 App Router, Vitest.

## Codebase anchors (verified during planning)

**Better Auth — how the row delete is intercepted**

Two *different* hooks are involved, and confusing them is the main hazard in this task:

- `user.deleteUser.beforeDelete` (endpoint-scoped) runs at
  `node_modules/better-auth/dist/api/routes/update-user.mjs:365-366`, immediately before
  `internalAdapter.deleteUser(...)` at `:367`. It **cannot** stop the delete — the call at `:367` is
  unconditional regardless of what the hook returns. This is exactly why the spec calls the current
  hook "a trap for a future reader". What it *can* do is run our transaction first, and **abort the
  whole request by throwing** — nothing has been deleted at that point.
- `databaseHooks.user.delete.before` (model-scoped) is the one with veto power.
  `internalAdapter.deleteUser` (`dist/db/internal-adapter.mjs:128-141`) routes the row delete through
  `deleteWithHooks`, and `dist/db/with-hooks.mjs:101-108` reads:

  ```js
  if (entityToDelete) for (const hook of hooks || []) {
    const toRun = hook[model]?.delete?.before;
    if (toRun) { if (await toRun(entityToDelete, context) === false) return null; }
  }
  const deleted = (!customDeleteFn || customDeleteFn.executeMainFn) && entityToDelete
    ? await (await getCurrentAdapter(adapter)).delete({ model, where }) : customDeleted;
  ```

  Returning **exactly `false`** (not `undefined`, not truthy) returns early and `adapter.delete()`
  never runs. Documented in the option type at
  `@better-auth/core/dist/types/init-options.d.mts:1084-1089` — *"if the hook returns false, the user
  will not be deleted."*

- **Ordering is why the transaction goes in `beforeDelete`, not in the database hook.**
  `internalAdapter.deleteUser` deletes sessions (`internal-adapter.mjs:129-132`) and accounts
  (`:133-136`) *before* it reaches `deleteWithHooks` for the user (`:137-140`). Putting the
  anonymisation in `databaseHooks.user.delete.before` would therefore run it *after* credentials were
  already destroyed outside our transaction — a mid-transaction failure would leave an account that
  cannot sign in but is otherwise intact, violating the spec's Atomicity criterion ("a failure partway
  leaves the account fully intact and **still able to sign in**"). Running in `beforeDelete` and
  throwing on failure aborts the request before Better Auth touches anything.
- The email/UX path is untouched. `authClient.deleteUser({ password, callbackURL })`
  (`app/_components/Account/DangerZoneSection/hooks/useDangerZone.ts:13-16`) hits `POST /delete-user`,
  which verifies the password (`update-user.mjs:271-278`) and — because
  `sendDeleteAccountVerification` stays configured — always takes the "send verification email" branch
  (`:289-302`) and deletes nothing. The emailed link still points at Better Auth's own
  `/delete-user/callback`, whose token validation (`:363-366`) is unchanged. **No new page, no new
  tRPC procedure, no re-implemented token flow.**
- Current config to be replaced: `server/better-auth/config.ts:69-87`.

**Transactions — do not copy the prevailing pattern**

- ✅ **Correct:** `server/repositories/message.repository.ts:35-45` — `db.$transaction(async (tx) => …)`
  with every write going through `tx`. This is the pattern this feature uses.
- ❌ **Broken:** `server/services/instructor/instructor.service.ts:45-61` and
  `server/services/course/course.service.ts:39-49` call `someRepository.transaction(async () => …)`
  then issue writes through the **module-level repository singletons**, which hold `db`, not `tx`.
  Those writes run *outside* the interactive transaction, so the wrapper buys no atomicity. Do not
  route the anonymisation through `BaseRepository.transaction` (`base.repository.ts:536-547`).
- `BaseRepository` exposes `protected get db()` (`base.repository.ts:66-68`), so a subclass can call
  `this.db.$transaction(...)` directly.
- `user_interest_embeddings` has an `Unsupported("vector(1536)")` column (`embeddings.prisma:27`), and
  every mutation on it in this codebase goes through raw SQL —
  `server/repositories/embedding.repository.ts:48` is literally
  `` DELETE FROM user_interest_embeddings WHERE "userId" = ${userId} ``. Follow that convention.

**Schema — every `User` relation, with its current action**

| Model.field | Anchor | Now | After |
|---|---|---|---|
| `Session.userId` | `auth.prisma:52` | Cascade | Cascade (destroyed) |
| `Account.userId` | `auth.prisma:63` | Cascade | Cascade (destroyed) |
| `Post.createdById` | `post.prisma:7` | *(none → Restrict)* | **model dropped** |
| `Course.instructorId` | `course.prisma:34` | Cascade | **Restrict** |
| `LessonProgress.studentId` | `lesson.prisma:37` | Cascade | **Restrict** |
| `QuizAttempt.studentId` | `quiz.prisma:24` | Cascade | **Restrict** |
| `InstructorProfile.userId` | `instructor.prisma:4` | Cascade | **Restrict** (scrubbed — Task 6) |
| `Enrollment.studentId` | `enrollment.prisma:11` | Cascade | **Restrict** |
| `CourseProgress.studentId` | `course.prisma:55` | Cascade | **Restrict** |
| `CourseReview.studentId` | `review.prisma:19` | Cascade | **Restrict** |
| `UserInterestEmbedding.userId` | `embeddings.prisma:31` | Cascade | Cascade (destroyed) |
| `LessonAssistantConversation.studentId` | `lessonAssistant.prisma:9` | Cascade | Cascade (destroyed) |
| `ConceptMastery.studentId` | `lessonAssistant.prisma:40` | Cascade | **Restrict** |
| `LearningPathCache.studentId` | `course.prisma:98` | Cascade | Cascade (destroyed — Deviation 2) |
| `NotificationLog.userId` | `notification.prisma:9` | Cascade | Cascade (destroyed) |
| `Payment.studentId` | `payments.prisma:18` | Cascade | **Restrict** |
| `Payment.courseId` | `payments.prisma:20` | Cascade | **Restrict** |
| `Payment.instructorId` | `payments.prisma:22` | Cascade | **Restrict** |
| `Conversation.studentId` | `message.prisma:5` | Cascade | **Restrict** |
| `Conversation.instructorId` | `message.prisma:8` | Cascade | **Restrict** |
| `Message.senderId` | `message.prisma:31` | Cascade | **Restrict** |
| `CourseGeneration.instructorId` | `courseGeneration.prisma:22` | **no FK at all** | **FK + Cascade** (destroyed) |

- `Payment.courseId → Restrict` is safe: the only production course deletion is
  `server/api/routers/course.ts:62`, which calls `courseRepository.deleteCourse(input, true)` —
  explicit **soft** delete. (Note `isSoftDelete` is never set to `true` in any repository, so the
  default argument would have hard-deleted; that call site passes `true` explicitly.)
- Course-internal cascades (`Section.courseId`, `Lesson.sectionId`, `Quiz.lessonId`,
  `Enrollment.courseId`, `CourseProgress.courseId`, `CourseReview.courseId`, `Conversation.courseId`,
  `ConceptMastery.courseId`, `CourseSkill.*`, embeddings, insights) stay `Cascade` — they support
  normal curriculum editing and are not on the `User` deletion path. Only `Payment.courseId` is
  singled out, because the spec's Agent notes name it explicitly.
- The four unique constraints the spec relies on: `review.prisma:29`, `message.prisma:18`,
  `course.prisma:67`, `course.prisma:101`. None includes `email` or `name`, so overwriting those
  fields in place cannot collide.

**Service / router / repository layer**

- `server/services/user/user.service.ts:7-27` and `user.errors.ts:3`
  (`export class UserError extends DomainError {}`) — the shape new services mirror.
  `DomainError` (`server/services/base/base.errors.ts`) takes `(message, code, cause, context)`.
- `server/repositories/user.repository.ts` — `UserRepository extends BaseRepository<"user", …>`, no
  overrides yet.
- **No new tRPC procedure is needed.** The only caller is Better Auth's server-side hook, exactly as
  the current `beforeDelete` at `config.ts:73-78` calls `courseRepository.updateMany` directly. A
  `user.deleteAccount` mutation would have no caller.

**Tests**

- `test/db.ts` — `testDb`, and `TABLES` (`:6-39`), a **manually maintained** list used by
  `truncateAll()` (`:41-44`) via `TRUNCATE … CASCADE`. It contains `"posts"`, which must be removed
  with the model. `truncateAll` is unaffected by `Restrict` (TRUNCATE CASCADE ignores FK actions).
- `test/setup.integration.ts` — asserts `DATABASE_URL` contains `learnix_test`, runs `truncateAll()`
  in `beforeEach`.
- `test/factories.ts` — has `makeUser`, `makeCourse`, `makeSection`, `makeLesson`, `makeEnrollment`,
  `makeLessonProgress`, `makeQuiz`, `makeQuizAttempt`, `makeLessonInsights`, `makeConceptMastery`.
  **No** `makePayment`, `makeCourseReview`, `makeConversation`, `makeMessage`,
  `makeInstructorProfile` — Task 1 adds them.
- **Verified clear:** no test in this repo tears down by deleting a `User` row
  (`grep` for `.user.delete(` / `userRepository.delete` / `forceDelete` in `**/*.test.ts` → zero
  matches), so the `Restrict` downgrade breaks no existing fixture.
- `vitest.config.ts` — `integration` project runs `**/*.integration.test.ts` with
  `fileParallelism: false`.

**Migrations**

- `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_case>/migration.sql`, generated by `pnpm db:generate`.
- Precedent for a pure FK-retarget migration:
  `prisma/migrations/20251124183749_added_cascade_to_models/migration.sql` — nothing but
  `DROP CONSTRAINT` / `ADD CONSTRAINT … ON DELETE …` pairs.
- Hand-editing generated SQL is established practice:
  `20260511104501_pgvector_init/migration.sql`.

---

## Deviations from `spec.md` — read before starting

Three points where following the spec literally would defeat one of its own guarantees. Each is
implemented the corrected way below and must be reflected back into `spec.md` at the `/qa` gate.

**Deviation 1 — `InstructorProfile` is scrubbed, not destroyed. (Material; affects money.)**
The spec's *Destroyed* table lists `InstructorProfile` as "biography and headline — authored
self-description". It also holds `stripeAccountId`, `stripeChargesEnabled`, `stripePayoutsEnabled`,
`stripeOnboardedAt` (`instructor.prisma:12-15`). The payout sweep resolves an instructor's Stripe
account through exactly this row — `server/services/payments/connect.service.ts:119-128` does
`instructorProfileRepository.findFirst({ where: { userId: payment.instructorId } })` and, when
`profile?.stripeAccountId` is missing, writes `transferStatus: "pending"` and returns. Destroying the
profile therefore **permanently strands every pending transfer owed to a deleting instructor** — the
precise failure ("The instructor is simply never paid") that the spec's Purpose section exists to
stop. The Connect webhook handler (`connect.service.ts:93-98`) would also stop resolving that account.
Task 6 keeps the row and blanks only the authored free text, which is exactly the spec's own stated
rule ("free text the person wrote about themselves is destroyed, structured facts are kept").

**Deviation 2 — `LearningPathCache` is unclassified in the spec; this plan destroys it.**
It appears in neither the *Destroyed* nor the *Retained* table, yet `LearningPathCache.studentId`
(`course.prisma:98`) is a live `User` relation that must get one behaviour or the other. It is a
per-student, regenerable AI cache derived solely from that student's behaviour (`steps`, `summary`,
`weakConcepts`, and a `staleAt` field marking it disposable — `course.prisma:87-102`), i.e. the
sibling of `UserInterestEmbedding`, which the spec does destroy. It is destroyed here. **Confirm this
at approval** — it is the one classification not already settled by the spec.

**Deviation 3 — one sentence of danger-zone copy is now false.**
Spec §6 says the wording stays as it is, but `DangerZoneSection/index.tsx:39-41` and `:54-56` tell the
user "Instructor courses will be archived to preserve enrolled students' access" / "Courses you
created will be archived, not erased." After this change courses are **not** archived — they stay
published and purchasable, which is the entire point of retaining them. Task 10 corrects those two
sentences and nothing else. Everything else about the UX — the dialog, the password field, the email,
the button labels, the flow — is untouched.

*(Minor, no action needed: the spec's Destroyed table says "`Notification`". There is no `Notification`
model; `NotificationLog` (`notification.prisma:1`) is the only user-addressed notification table and is
what this plan destroys.)*

---

**Per-task conventions:** after the implementation step, `pnpm typecheck` and `pnpm check` must be
clean before committing. Unit tests are colocated `*.test.ts`; integration tests are
`*.integration.test.ts` and need the `learnix_test` database (`docker-compose up -d`). Services and
repositories export singletons. Component prop types live in a colocated `types.ts`; components and
helpers are arrow-function consts. Commit messages carry **no** `Co-Authored-By` trailer.

Run `pnpm generate` after every schema change before typechecking.

---

## Task 1: Test factories for the retained models

Nothing else can be tested without fixtures for payments, reviews, conversations and instructor
profiles. Pure test-support; no production code, no behaviour change.

**Files:**
- Modify: `test/factories.ts`

- [ ] **Step 1: Add the missing factories**

Append to `test/factories.ts` (it already imports `randomUUID`, `Prisma`, `Role`, `testDb`):

```ts
export function makeInstructorProfile(
	overrides: Partial<Prisma.InstructorProfileUncheckedCreateInput> & {
		userId: string;
	},
) {
	return testDb.instructorProfile.create({
		data: {
			areaOfExpertise: "Software Engineering",
			teachingExperience: "5 years",
			professionalBio: "I have taught backend engineering since 2019.",
			courseIdea: "A course on distributed systems",
			...overrides,
		},
	});
}

export function makePayment(
	overrides: Partial<Prisma.PaymentUncheckedCreateInput> & {
		studentId: string;
		instructorId: string;
		courseId: string;
	},
) {
	return testDb.payment.create({
		data: {
			amountCents: 4999,
			platformFeeCents: 1000,
			instructorNetCents: 3999,
			status: "succeeded",
			transferStatus: "none",
			...overrides,
		},
	});
}

export function makeCourseReview(
	overrides: Partial<Prisma.CourseReviewUncheckedCreateInput> & {
		courseId: string;
		studentId: string;
	},
) {
	return testDb.courseReview.create({
		data: { rating: 5, comment: "Excellent course.", ...overrides },
	});
}

export function makeConversation(
	overrides: Partial<Prisma.ConversationUncheckedCreateInput> & {
		studentId: string;
		instructorId: string;
		courseId: string;
	},
) {
	return testDb.conversation.create({ data: { ...overrides } });
}

export function makeMessage(
	overrides: Partial<Prisma.MessageUncheckedCreateInput> & {
		conversationId: string;
		senderId: string;
	},
) {
	return testDb.message.create({
		data: { body: "Hello, I have a question about lesson 2.", ...overrides },
	});
}
```

- [ ] **Step 2: Verify they compile against the real schema**

Run: `pnpm typecheck`
Expected: PASS. If a required column is missing (e.g. `CourseReview` requires a field not defaulted
above), read `prisma/schema/review.prisma` / `payments.prisma` / `message.prisma` and add it to the
factory defaults — **do not** loosen the type.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(factories): add payment, review, conversation and instructor-profile factories"
```

---

## Task 2: Delete the `Post` scaffold model

Unused T3 leftover whose `Restrict` FK (`post.prisma:7`, no `onDelete`) would block account deletion
outright.

**Files:**
- Delete: `prisma/schema/post.prisma`
- Modify: `prisma/schema/auth.prisma:17`
- Modify: `test/db.ts` (remove `"posts"` from `TABLES`)
- Create: `prisma/migrations/<generated>_drop_post_model/migration.sql`

- [ ] **Step 1: Prove nothing references it**

Run:
```bash
grep -rn "\bPost\b\|\bposts\b" server/ app/ lib/ scripts/ test/ --include=*.ts --include=*.tsx
```
Expected: the only hit is `test/db.ts` (`"posts"` in `TABLES`). If anything else appears, **stop** and
report — the spec's premise that `Post` is unused would be wrong.

- [ ] **Step 2: Remove the model**

Delete `prisma/schema/post.prisma`. In `prisma/schema/auth.prisma`, delete line 17
(`  posts                        Post[]`). In `test/db.ts`, remove the `"posts",` entry from `TABLES`.

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate --name drop_post_model`
Expected: a migration containing the FK drop and `DROP TABLE "posts";`.

- [ ] **Step 4: Verify**

Run: `pnpm generate && pnpm typecheck && pnpm check`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(schema): drop the unused Post scaffold model"
```

---

## Task 3: Give `CourseGeneration.instructorId` the foreign key it never had

Without an FK these rows — and the instructor's full AI course-builder transcript in
`CourseGenerationMessage.content` — survive deletion as orphans indefinitely.

**Files:**
- Modify: `prisma/schema/courseGeneration.prisma:20-36`
- Modify: `prisma/schema/auth.prisma` (add the back-relation)
- Create: `prisma/migrations/<generated>_add_course_generation_instructor_fk/migration.sql`
- Test: `server/repositories/user.repository.integration.test.ts` (created here)

- [ ] **Step 1: Write the failing test**

Create `server/repositories/user.repository.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeUser } from "@/test/factories";

describe("CourseGeneration.instructorId foreign key", () => {
	it("rejects a generation whose instructor does not exist", async () => {
		await expect(
			testDb.courseGeneration.create({
				data: { instructorId: "no-such-user", content: {} },
			}),
		).rejects.toThrow();
	});

	it("accepts a generation for a real instructor", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });

		const generation = await testDb.courseGeneration.create({
			data: { instructorId: instructor.id, content: {} },
		});

		expect(generation.instructorId).toBe(instructor.id);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: FAIL on the first test — the insert succeeds because there is no FK to violate.

- [ ] **Step 3: Add the relation**

In `prisma/schema/courseGeneration.prisma`, replace line 22 with:

```prisma
  instructorId String @map("instructor_id")
  instructor   User   @relation(fields: [instructorId], references: [id], onDelete: Cascade)
```

In `prisma/schema/auth.prisma`, add to the `User` model's relation list (next to
`lessonAssistantConversations`):

```prisma
  courseGenerations            CourseGeneration[]
```

- [ ] **Step 4: Generate the migration, then hand-edit it to clear orphans first**

Run: `pnpm db:generate --name add_course_generation_instructor_fk`

Prisma emits only the `ADD CONSTRAINT`, and Postgres validates every existing row against a new FK, so
**creating it fails if any orphan exists**. First count them:

```bash
docker-compose exec -T postgres psql -U postgres -d learnix -c \
  'SELECT count(*) FROM course_generations WHERE instructor_id NOT IN (SELECT id FROM users);'
```

If the count is 0, apply the generated migration unchanged and note "0 orphans" in the commit message.
If it is greater than 0, prepend this cleanup to the generated `migration.sql`:

```sql
-- Orphaned generations (author's user row already hard-deleted under the old cascade
-- behaviour) cannot satisfy the new foreign key. They are private AI-chat transcripts
-- belonging to accounts that no longer exist, and this feature destroys them regardless.
DELETE FROM "course_generation_messages"
WHERE "generation_id" IN (
  SELECT "id" FROM "course_generations"
  WHERE "instructor_id" NOT IN (SELECT "id" FROM "users")
);

DELETE FROM "course_generations"
WHERE "instructor_id" NOT IN (SELECT "id" FROM "users");

-- AddForeignKey  (generated by Prisma below this line)
```

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm generate && pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: both tests PASS. Then `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(schema): add the missing CourseGeneration -> User foreign key"
```

---

## Task 4: Downgrade the retained relations to `onDelete: Restrict`

This is what makes the cascade unable to come back. **This task intentionally leaves account deletion
broken** — Better Auth's `deleteUser` will now throw a foreign-key error for any user with retained
data. Tasks 5–9 replace it. Do not stop here.

**Files:**
- Modify: `prisma/schema/course.prisma:34`, `:55`
- Modify: `prisma/schema/lesson.prisma:37`
- Modify: `prisma/schema/quiz.prisma:24`
- Modify: `prisma/schema/instructor.prisma:4`
- Modify: `prisma/schema/enrollment.prisma:11`
- Modify: `prisma/schema/review.prisma:19`
- Modify: `prisma/schema/lessonAssistant.prisma:40`
- Modify: `prisma/schema/payments.prisma:18`, `:20`, `:22`
- Modify: `prisma/schema/message.prisma:5`, `:8`, `:31`
- Create: `prisma/migrations/<generated>_restrict_user_cascades/migration.sql`
- Test: `server/repositories/user.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/repositories/user.repository.integration.test.ts`:

```ts
describe("User relations that must never cascade", () => {
	it("refuses to delete an instructor who has a course", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeCourse({ instructorId: instructor.id });

		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();

		expect(
			await testDb.user.findUnique({ where: { id: instructor.id } }),
		).not.toBeNull();
	});

	it("refuses to delete a student who has a payment, enrollment or review", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeCourseReview({ courseId: course.id, studentId: student.id });

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
	});

	it("refuses to delete either party to a conversation", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({ instructorId: instructor.id });
		const conversation = await makeConversation({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeMessage({
			conversationId: conversation.id,
			senderId: student.id,
		});

		await expect(
			testDb.user.delete({ where: { id: student.id } }),
		).rejects.toThrow();
		await expect(
			testDb.user.delete({ where: { id: instructor.id } }),
		).rejects.toThrow();
	});
});
```

Extend the file's `@/test/factories` import to
`{ makeConversation, makeCourse, makeCourseReview, makeEnrollment, makeMessage, makePayment, makeUser }`.

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: FAIL — the deletes currently succeed, cascading away the course, payment, review and
conversation.

- [ ] **Step 3: Change every listed relation to `Restrict`**

Change `onDelete: Cascade` → `onDelete: Restrict` on exactly these 14 fields, and nothing else:

| File | Line | Field |
|---|---|---|
| `course.prisma` | 34 | `Course.instructor` |
| `course.prisma` | 55 | `CourseProgress.student` |
| `lesson.prisma` | 37 | `LessonProgress.student` |
| `quiz.prisma` | 24 | `QuizAttempt.student` |
| `instructor.prisma` | 4 | `InstructorProfile.user` |
| `enrollment.prisma` | 11 | `Enrollment.student` |
| `review.prisma` | 19 | `CourseReview.student` |
| `lessonAssistant.prisma` | 40 | `ConceptMastery.student` |
| `payments.prisma` | 18 | `Payment.student` |
| `payments.prisma` | 20 | `Payment.course` |
| `payments.prisma` | 22 | `Payment.instructor` |
| `message.prisma` | 5 | `Conversation.student` |
| `message.prisma` | 8 | `Conversation.instructor` |
| `message.prisma` | 31 | `Message.sender` |

**Leave as `Cascade`:** `Session.userId`, `Account.userId`, `UserInterestEmbedding.userId`,
`LessonAssistantConversation.studentId`, `LessonAssistantMessage.conversationId`,
`LearningPathCache.studentId`, `NotificationLog.userId`, `CourseGeneration.instructorId`,
`CourseGenerationMessage.generationId`, and every course-internal relation (see Codebase anchors).

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate --name restrict_user_cascades`
Expected: a migration of `DROP CONSTRAINT` / `ADD CONSTRAINT … ON DELETE RESTRICT` pairs only, in the
shape of `20251124183749_added_cascade_to_models/migration.sql`. Read it and confirm there are exactly
14 pairs and no `DROP TABLE` or column changes.

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm generate && pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: all PASS. Then `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 6: Confirm the rest of the suite still passes**

Run: `pnpm test:integration`
Expected: green. `truncateAll()` uses `TRUNCATE … CASCADE`, which ignores FK actions, so teardown is
unaffected.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(schema): restrict the user cascades that destroy other people's data"
```

---

## Task 5: The anonymisation transaction

One interactive transaction that destroys credentials and private authored content, then overwrites
the identifying fields. Lives in the repository because it is pure data access, and uses `tx` for
every statement (see Codebase anchors — `BaseRepository.transaction` is not actually atomic).

**Files:**
- Modify: `server/repositories/user.repository.ts`
- Test: `server/repositories/user.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/repositories/user.repository.integration.test.ts`:

```ts
describe("userRepository.anonymiseAccount", () => {
	it("overwrites the identifying fields and keeps the row", async () => {
		const user = await makeUser({
			name: "Ada Lovelace",
			image: "https://example.com/ada.png",
			emailVerified: true,
		});

		await userRepository.anonymiseAccount(user.id);

		const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.name).toBe("Deleted user");
		expect(after.email).toBe(`deleted-${user.id}@system.invalid`);
		expect(after.image).toBeNull();
		expect(after.emailVerified).toBe(false);
		expect(after.emailNotificationsEnabled).toBe(false);
	});

	it("destroys credentials and private authored content", async () => {
		const user = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({ instructorId: user.id });
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });

		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await testDb.account.create({
			data: { userId: user.id, accountId: user.id, providerId: "credential" },
		});
		const conversation = await testDb.lessonAssistantConversation.create({
			data: { lessonId: lesson.id, studentId: user.id },
		});
		await testDb.lessonAssistantMessage.create({
			data: { conversationId: conversation.id, role: "user", content: "secret" },
		});
		const generation = await testDb.courseGeneration.create({
			data: { instructorId: user.id, content: {} },
		});
		await testDb.courseGenerationMessage.create({
			data: { generationId: generation.id, role: "user", content: "secret" },
		});
		await testDb.notificationLog.create({
			data: {
				userId: user.id,
				automation: "inactivity",
				dedupKey: `dedup-${user.id}`,
				payload: {},
			},
		});
		await testDb.learningPathCache.create({
			data: {
				studentId: user.id,
				courseId: course.id,
				steps: [],
				summary: "s",
				weakConcepts: [],
				model: "test",
			},
		});
		await testDb.$executeRaw`
			INSERT INTO user_interest_embeddings ("userId", embedding, "updatedAt")
			VALUES (${user.id}, ${`[${Array(1536).fill(0).join(",")}]`}::vector, NOW())
		`;

		await userRepository.anonymiseAccount(user.id);

		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(0);
		expect(await testDb.account.count({ where: { userId: user.id } })).toBe(0);
		expect(
			await testDb.lessonAssistantConversation.count({ where: { studentId: user.id } }),
		).toBe(0);
		expect(await testDb.lessonAssistantMessage.count()).toBe(0);
		expect(await testDb.courseGeneration.count({ where: { instructorId: user.id } })).toBe(0);
		expect(await testDb.courseGenerationMessage.count()).toBe(0);
		expect(await testDb.notificationLog.count({ where: { userId: user.id } })).toBe(0);
		expect(await testDb.learningPathCache.count({ where: { studentId: user.id } })).toBe(0);

		const embeddings = await testDb.$queryRaw<{ count: bigint }[]>`
			SELECT count(*) FROM user_interest_embeddings WHERE "userId" = ${user.id}
		`;
		expect(Number(embeddings[0]?.count)).toBe(0);
	});

	it("rolls the whole operation back when any statement fails", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });
		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});

		// Occupy the anonymised address so the final UPDATE violates users.email's
		// unique constraint — a real failure, after the deletes have already run.
		await makeUser({ email: `deleted-${user.id}@system.invalid` });

		await expect(userRepository.anonymiseAccount(user.id)).rejects.toThrow();

		const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.name).toBe("Ada Lovelace");
		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(1);
	});

	it("lets two accounts sharing a course, review and thread both be anonymised", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const a = await makeUser();
		const b = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id, status: "published" });

		for (const student of [a, b]) {
			await makeCourseReview({ courseId: course.id, studentId: student.id });
			await testDb.courseProgress.create({
				data: { studentId: student.id, courseId: course.id },
			});
			await makeConversation({
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
			});
		}

		await userRepository.anonymiseAccount(a.id);
		await userRepository.anonymiseAccount(b.id);

		const emails = await testDb.user.findMany({
			where: { id: { in: [a.id, b.id] } },
			select: { email: true },
		});
		expect(new Set(emails.map((e) => e.email)).size).toBe(2);
	});
});
```

Extend the imports with `makeLesson`, `makeSection`, and
`import { userRepository } from "./user.repository";`.

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: FAIL — `userRepository.anonymiseAccount is not a function`.

- [ ] **Step 3: Implement**

Replace `server/repositories/user.repository.ts` with:

```ts
import type { User } from "better-auth";
import type { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export const ANONYMISED_USER_NAME = "Deleted user";

export const anonymisedEmailFor = (userId: string): string =>
	`deleted-${userId}@system.invalid`;

export default class UserRepository extends BaseRepository<
	"user",
	User,
	Prisma.UserCreateInput,
	Prisma.UserUpdateInput,
	Prisma.UserWhereInput,
	Prisma.UserInclude,
	Prisma.UserSelect,
	Prisma.UserOrderByWithRelationInput
> {
	protected readonly modelName = "user" as const;

	/**
	 * Irreversibly anonymises an account in place.
	 *
	 * The `User` row is deliberately retained: every foreign key and four unique
	 * constraints depend on it, so removing it would cascade into other people's
	 * courses, payments, reviews and conversations. See
	 * docs/specs/features/account-deletion-data-retention/spec.md.
	 *
	 * Every statement runs through `tx`. Do not refactor this onto
	 * `BaseRepository.transaction` — its existing call sites issue writes through
	 * repository singletons that hold `db`, not `tx`, so they are not atomic.
	 */
	public async anonymiseAccount(userId: string): Promise<void> {
		await this.db.$transaction(async (tx) => {
			// Credentials — retaining any of these would make the anonymisation reversible.
			await tx.session.deleteMany({ where: { userId } });
			await tx.account.deleteMany({ where: { userId } });

			// Private authored content.
			await tx.lessonAssistantMessage.deleteMany({
				where: { conversation: { studentId: userId } },
			});
			await tx.lessonAssistantConversation.deleteMany({
				where: { studentId: userId },
			});
			await tx.courseGenerationMessage.deleteMany({
				where: { generation: { instructorId: userId } },
			});
			await tx.courseGeneration.deleteMany({ where: { instructorId: userId } });

			// Derived behavioural profiles and personal addressing.
			// `user_interest_embeddings` carries an Unsupported("vector(1536)") column;
			// every mutation on it in this codebase goes through raw SQL
			// (server/repositories/embedding.repository.ts:48).
			await tx.$executeRaw`
				DELETE FROM user_interest_embeddings WHERE "userId" = ${userId}
			`;
			await tx.learningPathCache.deleteMany({ where: { studentId: userId } });
			await tx.notificationLog.deleteMany({ where: { userId } });

			await tx.user.update({
				where: { id: userId },
				data: {
					name: ANONYMISED_USER_NAME,
					email: anonymisedEmailFor(userId),
					image: null,
					emailVerified: false,
					emailNotificationsEnabled: false,
					welcomeEmailSentAt: null,
				},
			});
		});
	}
}

export const userRepository = new UserRepository();
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(user): anonymise an account in place inside one transaction"
```

---

## Task 6: Scrub `InstructorProfile` instead of destroying it

See **Deviation 1**. Destroying the row strands every pending Stripe transfer owed to the instructor,
because `connect.service.ts:119-128` resolves the payout account through it.

**Files:**
- Modify: `server/repositories/user.repository.ts`
- Test: `server/repositories/user.repository.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `userRepository.anonymiseAccount` describe block:

```ts
it("blanks the instructor's authored text but keeps the payout account", async () => {
	const instructor = await makeUser({ role: Role.INSTRUCTOR });
	await makeInstructorProfile({
		userId: instructor.id,
		professionalBio: "I have taught backend engineering since 2019.",
		courseIdea: "A course on distributed systems",
		teachingExperience: "5 years at a FAANG",
		areaOfExpertise: "Distributed systems",
		phone: "+380000000000",
		linkedinUrl: "https://linkedin.com/in/example",
		websiteUrl: "https://example.com",
		stripeAccountId: "acct_test_123",
		stripeChargesEnabled: true,
		stripePayoutsEnabled: true,
	});

	await userRepository.anonymiseAccount(instructor.id);

	const profile = await testDb.instructorProfile.findUniqueOrThrow({
		where: { userId: instructor.id },
	});

	// Authored self-description is gone.
	expect(profile.professionalBio).toBe("");
	expect(profile.courseIdea).toBe("");
	expect(profile.teachingExperience).toBe("");
	expect(profile.areaOfExpertise).toBe("");
	expect(profile.phone).toBeNull();
	expect(profile.linkedinUrl).toBeNull();
	expect(profile.websiteUrl).toBeNull();

	// The payout account survives, so money already owed can still be transferred.
	expect(profile.stripeAccountId).toBe("acct_test_123");
	expect(profile.stripePayoutsEnabled).toBe(true);
});
```

Add `makeInstructorProfile` to the `@/test/factories` import.

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: FAIL — the profile is untouched, so `professionalBio` still holds the original text.

- [ ] **Step 3: Implement**

In `anonymiseAccount`, insert immediately before the final `tx.user.update(...)`:

```ts
			// The instructor profile is scrubbed rather than destroyed: it carries
			// `stripeAccountId`, which the payout sweep needs to pay out money already
			// owed (server/services/payments/connect.service.ts:119-128). Only the
			// authored free text is removed.
			await tx.instructorProfile.updateMany({
				where: { userId },
				data: {
					professionalBio: "",
					courseIdea: "",
					teachingExperience: "",
					areaOfExpertise: "",
					phone: null,
					linkedinUrl: null,
					websiteUrl: null,
				},
			});
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(user): scrub the instructor profile without stranding pending payouts"
```

---

## Task 7: Third-party data survives — the regression suite

The whole point of the feature. These tests would have caught the current behaviour.

**Files:**
- Test: `server/repositories/user.repository.integration.test.ts`

- [ ] **Step 1: Write the tests (they should pass immediately — this is the proof, not new behaviour)**

Append:

```ts
describe("anonymisation leaves other people's data intact", () => {
	it("keeps the course, its curriculum and the student's progress when the instructor leaves", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const section = await makeSection({ courseId: course.id });
		const lesson = await makeLesson({ sectionId: section.id });
		const enrollment = await makeEnrollment({
			studentId: student.id,
			courseId: course.id,
		});
		await testDb.courseProgress.create({
			data: { studentId: student.id, courseId: course.id },
		});
		await makeConceptMastery({
			studentId: student.id,
			courseId: course.id,
			concept: "Recursion",
		});

		await userRepository.anonymiseAccount(instructor.id);

		expect(await testDb.course.findUnique({ where: { id: course.id } })).not.toBeNull();
		expect(await testDb.section.findUnique({ where: { id: section.id } })).not.toBeNull();
		expect(await testDb.lesson.findUnique({ where: { id: lesson.id } })).not.toBeNull();
		expect(
			await testDb.enrollment.findUnique({ where: { id: enrollment.id } }),
		).not.toBeNull();
		expect(
			await testDb.courseProgress.count({ where: { studentId: student.id } }),
		).toBe(1);
		expect(
			await testDb.conceptMastery.count({ where: { studentId: student.id } }),
		).toBe(1);
	});

	it("leaves the course still published and readable", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await userRepository.anonymiseAccount(instructor.id);

		const after = await testDb.course.findUniqueOrThrow({
			where: { id: course.id },
			include: { instructor: true },
		});
		expect(after.status).toBe("published");
		expect(after.deletedAt).toBeNull();
		expect(after.instructor.name).toBe("Deleted user");
	});

	it("preserves every payment field, including money in flight", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
			stripePaymentIntentId: "pi_test_123",
			stripeTransferId: null,
		});

		await userRepository.anonymiseAccount(student.id);

		const after = await testDb.payment.findUniqueOrThrow({
			where: { id: payment.id },
		});
		expect(after.amountCents).toBe(payment.amountCents);
		expect(after.transferStatus).toBe("pending");
		expect(after.stripePaymentIntentId).toBe("pi_test_123");
		expect(after.stripeTransferId).toBeNull();
	});

	it("leaves a pending transfer visible to the sweep", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
		});

		await userRepository.anonymiseAccount(student.id);

		// The exact query the sweep runs — server/api/routers/payment.ts:135-138.
		const pending = await testDb.payment.findMany({
			where: { transferStatus: "pending" },
			select: { instructorId: true },
		});
		expect(pending.map((p) => p.instructorId)).toContain(instructor.id);
	});

	it("leaves both sides of a conversation readable by the remaining party", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const conversation = await makeConversation({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		await makeMessage({ conversationId: conversation.id, senderId: student.id });
		await makeMessage({
			conversationId: conversation.id,
			senderId: instructor.id,
			body: "Happy to help.",
		});

		await userRepository.anonymiseAccount(student.id);

		const thread = await testDb.conversation.findUniqueOrThrow({
			where: { id: conversation.id },
			include: { messages: true },
		});
		expect(thread.messages).toHaveLength(2);
		expect(thread.messages.map((m) => m.body)).toContain("Happy to help.");
	});

	it("does not move the course rating when a reviewer leaves", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const a = await makeUser();
		const b = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		await makeCourseReview({ courseId: course.id, studentId: a.id, rating: 5 });
		await makeCourseReview({ courseId: course.id, studentId: b.id, rating: 3 });

		const before = await testDb.courseReview.aggregate({
			where: { courseId: course.id },
			_avg: { rating: true },
			_count: true,
		});

		await userRepository.anonymiseAccount(a.id);

		const after = await testDb.courseReview.aggregate({
			where: { courseId: course.id },
			_avg: { rating: true },
			_count: true,
		});
		expect(after._avg.rating).toBe(before._avg.rating);
		expect(after._count).toBe(before._count);
	});

	it("keeps a completed enrollment renderable as a certificate", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		const enrollment = await makeEnrollment({
			studentId: student.id,
			courseId: course.id,
			status: "completed",
			completedAt: new Date(),
		});

		await userRepository.anonymiseAccount(instructor.id);

		// certificate.service.ts:12-13 derives the PDF from exactly this shape.
		const found = await testDb.enrollment.findUniqueOrThrow({
			where: { id: enrollment.id },
			include: { course: true, student: true },
		});
		expect(found.status).toBe("completed");
		expect(found.course.title).toBe(course.title);
		expect(found.student.name).toBe("Deleted user");
	});
});
```

If `makeEnrollment` rejects `completedAt` / `status: "completed"`, read
`prisma/schema/enrollment.prisma` and use the real field names — do not weaken the assertion.

- [ ] **Step 2: Run, expect PASS**

Run: `pnpm vitest run --project integration server/repositories/user.repository.integration.test.ts`
Expected: all PASS. Any failure here is a real defect in Task 4/5/6 — fix the implementation, not the
test.

- [ ] **Step 3: Commit**

```bash
git commit -m "test(user): prove anonymisation preserves third-party data and certificates"
```

---

## Task 8: `userService.anonymiseAccount`

Thin service wrapper matching the existing `UserService` shape, so the auth hook calls a service and
not a repository directly.

**Files:**
- Modify: `server/services/user/user.service.ts`
- Test: `server/services/user/user.service.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/services/user/user.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/user.repository", () => ({
	userRepository: { anonymiseAccount: vi.fn(), update: vi.fn() },
}));
vi.mock("@/server/utils/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { userRepository } = await import("@/server/repositories/user.repository");
const { userService } = await import("./user.service");
const { UserError } = await import("./user.errors");

describe("userService.anonymiseAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("delegates to the repository", async () => {
		vi.mocked(userRepository.anonymiseAccount).mockResolvedValue(undefined);

		await userService.anonymiseAccount("user-1");

		expect(userRepository.anonymiseAccount).toHaveBeenCalledWith("user-1");
	});

	it("wraps a repository failure in a UserError", async () => {
		vi.mocked(userRepository.anonymiseAccount).mockRejectedValue(
			new Error("connection lost"),
		);

		await expect(userService.anonymiseAccount("user-1")).rejects.toBeInstanceOf(
			UserError,
		);
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project unit server/services/user/user.service.test.ts`
Expected: FAIL — `userService.anonymiseAccount is not a function`.

- [ ] **Step 3: Implement**

Add to `class UserService` in `server/services/user/user.service.ts`:

```ts
	/**
	 * Irreversibly anonymises an account in place. Called from Better Auth's
	 * `deleteUser.beforeDelete` hook (server/better-auth/config.ts); a throw here
	 * aborts the deletion request before anything is removed.
	 */
	async anonymiseAccount(userId: string) {
		try {
			return await userRepository.anonymiseAccount(userId);
		} catch (error) {
			logger.error("Failed to anonymise account:", error);
			throw new UserError("Failed to delete account");
		}
	}
```

- [ ] **Step 4: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(user): add anonymiseAccount to the user service"
```

---

## Task 9: Wire the two Better Auth hooks

The interception point. Extracted into their own module so they can be tested without an HTTP
round-trip — no existing test in this repo drives a Better Auth endpoint directly.

**Files:**
- Create: `server/better-auth/accountDeletion.hooks.ts`
- Modify: `server/better-auth/config.ts`
- Test: `server/better-auth/accountDeletion.hooks.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/better-auth/accountDeletion.hooks.integration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import {
	anonymiseOnAccountDeletion,
	preventUserRowDeletion,
} from "./accountDeletion.hooks";

describe("preventUserRowDeletion", () => {
	it("returns exactly false so Better Auth skips adapter.delete()", async () => {
		// with-hooks.mjs:104 compares with ===, so a falsy value is not enough.
		await expect(preventUserRowDeletion()).resolves.toBe(false);
	});
});

describe("anonymiseOnAccountDeletion", () => {
	it("anonymises the account before Better Auth touches anything", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });
		await testDb.session.create({
			data: {
				userId: user.id,
				token: "sess-token",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});

		await anonymiseOnAccountDeletion({ id: user.id });

		const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.name).toBe("Deleted user");
		expect(after.email).toBe(`deleted-${user.id}@system.invalid`);
		expect(await testDb.session.count({ where: { userId: user.id } })).toBe(0);
	});

	it("throws — aborting the deletion request — when anonymisation fails", async () => {
		const user = await makeUser({ name: "Ada Lovelace" });
		await makeUser({ email: `deleted-${user.id}@system.invalid` });

		await expect(anonymiseOnAccountDeletion({ id: user.id })).rejects.toThrow();

		const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
		expect(after.name).toBe("Ada Lovelace");
	});

	it("does not archive the instructor's courses", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		await anonymiseOnAccountDeletion({ id: instructor.id });

		const after = await testDb.course.findUniqueOrThrow({ where: { id: course.id } });
		expect(after.deletedAt).toBeNull();
		expect(after.status).toBe("published");
	});
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm vitest run --project integration server/better-auth/accountDeletion.hooks.integration.test.ts`
Expected: FAIL — `Cannot find module './accountDeletion.hooks'`.

- [ ] **Step 3: Implement the hooks module**

Create `server/better-auth/accountDeletion.hooks.ts`:

```ts
import { userService } from "@/server/services/user/user.service";

/**
 * Better Auth's `user.deleteUser.beforeDelete` hook.
 *
 * Runs at node_modules/better-auth/dist/api/routes/update-user.mjs:365-366,
 * immediately BEFORE `internalAdapter.deleteUser`. Two properties matter:
 *
 *  - It runs before Better Auth deletes the user's sessions and accounts
 *    (internal-adapter.mjs:129-136), so our transaction owns the whole operation
 *    and a failure leaves the account fully intact and still able to sign in.
 *  - Throwing here propagates out of the route handler, so nothing is deleted.
 *
 * It canNOT stop the row delete — that is `preventUserRowDeletion`'s job.
 */
export const anonymiseOnAccountDeletion = async (user: {
	id: string;
}): Promise<void> => {
	await userService.anonymiseAccount(user.id);
};

/**
 * Better Auth's `databaseHooks.user.delete.before` hook — the veto.
 *
 * `deleteWithHooks` (dist/db/with-hooks.mjs:101-108) compares the returned value
 * with `=== false` and returns early, so `adapter.delete({ model: "user" })` never
 * runs. It must return the literal `false`; `undefined` lets the delete proceed.
 *
 * This is unconditional on purpose: no code path may ever remove a `User` row,
 * because 20 relations and four unique constraints depend on it.
 */
export const preventUserRowDeletion = async (): Promise<false> => false;
```

- [ ] **Step 4: Wire them into the config**

In `server/better-auth/config.ts`: remove the `courseRepository` import (now unused) and add

```ts
import {
	anonymiseOnAccountDeletion,
	preventUserRowDeletion,
} from "@/server/better-auth/accountDeletion.hooks";
```

Replace the `deleteUser` block (lines 69-87) with:

```ts
			deleteUser: {
				enabled: true,
				// Anonymise in place instead of deleting. This hook cannot stop the row
				// delete on its own — `databaseHooks.user.delete.before` below does that —
				// but it runs first, owns the atomic transaction, and aborts the whole
				// request if it throws.
				//
				// The previous `beforeDelete` here soft-deleted the instructor's courses.
				// It was a no-op: the FK cascade removed those same courses moments later.
				// Do not reinstate that pattern — courses are now retained outright.
				beforeDelete: anonymiseOnAccountDeletion,
				sendDeleteAccountVerification: async ({ user, url }) => {
					await emailService.send({
						templateKey: "auth.account-deletion",
						toEmail: user.email,
						userId: user.id,
						payload: { name: user.name ?? user.email, confirmUrl: url },
					});
				},
			},
```

Then add a top-level `databaseHooks` option to the `betterAuth({ … })` call, next to `plugins`:

```ts
	databaseHooks: {
		user: {
			// Returning exactly `false` makes Better Auth skip the underlying
			// `DELETE FROM users` (dist/db/with-hooks.mjs:101-108). The row is retained;
			// `beforeDelete` above has already anonymised it.
			delete: { before: preventUserRowDeletion },
		},
	},
```

`sendDeleteAccountVerification` is unchanged — same template, same `url`, so the emailed link still
points at Better Auth's own `/delete-user/callback` and the confirmation UX is byte-for-byte identical.

- [ ] **Step 5: Run it, expect PASS** — and `pnpm typecheck` + `pnpm check` clean.

Run: `pnpm vitest run --project integration server/better-auth/accountDeletion.hooks.integration.test.ts`

If `beforeDelete: anonymiseOnAccountDeletion` fails to typecheck, Better Auth passes
`(user, request)` — widen the hook's parameter to
`(user: { id: string }, _request?: Request)` rather than casting.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(auth): anonymise in place instead of deleting the user row"
```

---

## Task 10: Correct the danger-zone copy

See **Deviation 3** — the panel currently promises behaviour this feature removes.

**Files:**
- Modify: `app/_components/Account/DangerZoneSection/index.tsx:39-41`, `:54-56`

- [ ] **Step 1: Replace the two inaccurate sentences**

In the `CardDescription` (currently "Permanently delete your account. This action cannot be undone.
Instructor courses will be archived to preserve enrolled students' access."):

```tsx
					Permanently delete your account. This action cannot be undone. Courses
					you published stay available to the students enrolled in them.
```

In the `DialogDescription` (currently "This permanently removes your account, sessions, and associated
data. Courses you created will be archived, not erased. Enter your password to confirm."):

```tsx
								This permanently removes your name, email address, sign-in
								credentials and private conversations. Courses you published and
								your students' progress in them are kept. Enter your password to
								confirm.
```

Everything else is unchanged: the dialog, the password input, the button labels, `useDangerZone.ts`,
and its `authClient.deleteUser({ password, callbackURL })` call. No new page, no new mutation.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm check && pnpm build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(account): describe what deletion actually does to published courses"
```

---

## Task 11: End-to-end manual verification

**Files:** none — this is a gate, not a change.

- [ ] **Step 1: Run the full suite**

```bash
pnpm typecheck && pnpm check && pnpm test
```
Expected: all green.

- [ ] **Step 2: Walk the real flow**

With `docker-compose up -d` and `pnpm dev`:

1. Sign in as an instructor who has a published course with an enrolled student, a succeeded payment,
   an instructor profile with a `stripeAccountId`, and a message thread.
2. Settings → Danger zone → enter password → **Delete account**. Expect no error and a confirmation
   email in the mail log.
3. Open the emailed link (Better Auth's `/api/auth/delete-user/callback?token=…`). Expect the redirect
   to `/` and to be signed out.
4. In Prisma Studio (`pnpm db:studio`) verify: the `User` row **still exists** with
   `name = "Deleted user"`, `email = deleted-<id>@system.invalid`, `image = null`; zero `sessions` and
   `accounts` rows; the course still `published` with `deletedAt = null`; the payment untouched; the
   message thread intact; the `instructor_profiles` row present with a blank bio and its
   `stripe_account_id` intact; no `course_generations` rows for that id.
5. Sign in as the enrolled student and open the course and a lesson. Both must render, showing
   "Deleted user" as the instructor.
6. Attempt to sign in as the deleted instructor with the old email and password. Must fail.
7. Repeat steps 1–3 for a second student who reviewed the **same** course as an
   already-deleted student. Must succeed with no unique-constraint error.

- [ ] **Step 3: Commit nothing; report the results in the PR description.**

---

## Self-review (run before handoff)

**Spec coverage — every Acceptance criterion mapped to a task:**

| Acceptance criterion (`spec.md`) | Task |
|---|---|
| `User` row survives; `name`/`email`/`image` overwritten | 5 (test 1), 9 (test 2) |
| Anonymised email unique per account | 5 (test 4) |
| No `Session`/`Account` survives; cannot sign in again | 5 (test 2), 11 (step 2.6) |
| Second deletion sharing course/review/thread/progress succeeds | 5 (test 4), 11 (step 2.7) |
| Instructor deletion leaves course, sections, lessons, student progress, `ConceptMastery` | 7 (test 1) |
| Student can still open the course and its lessons | 7 (test 2), 11 (step 2.5) |
| Every `Payment` field preserved | 7 (test 3) |
| Pending transfer still visible to the sweep; instructor still paid | 7 (test 4), **6** (payout account retained) |
| Both sides of a conversation readable | 7 (test 5) |
| Course rating unchanged | 7 (test 6) |
| Certificate still renders | 7 (test 7), 11 (step 2.4) |
| No private authored content survives | 5 (test 2) |
| `CourseGeneration` destroyed (reachable only once the FK exists) | 3, 5 (test 2) |
| Direct `user.delete()` raises an FK error | 4 (all three tests) |
| No `Post` model remains | 2 |
| Whole operation atomic; failure leaves the account able to sign in | 5 (test 3), 9 (test 3) |

No gaps.

**Placeholder scan:** no `TBD`, `TODO`, "handle edge cases", or "similar to Task N" appears in any code
step. Every code block is complete and runnable.

**Type consistency:** `anonymiseAccount(userId)` has one signature, used identically in Tasks 5, 6, 7
and 8. `ANONYMISED_USER_NAME` / `anonymisedEmailFor(userId)` are defined once in Task 5. The hook names
`anonymiseOnAccountDeletion` / `preventUserRowDeletion` are consistent between Task 9's test, module,
and config wiring.

**Ordering:** Task 4 intentionally leaves account deletion broken (Better Auth's `deleteUser` throws an
FK error) until Task 9 lands. Every other task leaves the build green. This is called out in Task 4's
header.

## Final verification

- `pnpm typecheck` — clean.
- `pnpm check` — clean.
- `pnpm test:unit` — green.
- `pnpm test:integration` — green (requires `learnix_test`; `docker-compose up -d` first).
- `pnpm build` — succeeds.
- The full manual walk in Task 11, step 2.

**Handed to `/qa`, which owns the Gate Docs DoD:** update `spec.md` frontmatter to `status: shipped`,
fold Deviations 1–3 into its Functional scope / Destroyed-and-Retained tables, run `pnpm spec:sync`,
and write the required ADR. Per `spec.md`'s Agent notes the ADR records anonymise-in-place versus a
per-deletion tombstone user (and why a single shared tombstone is not viable — it violates four unique
constraints); it should also record the two-hook Better Auth interception and its version coupling
(`databaseHooks.user.delete.before` returning `false` is load-bearing and must be re-verified on any
`better-auth` upgrade — pinned at 1.5.4 today), and the `InstructorProfile` payout finding from
Deviation 1. The accepted residual re-identification risk belongs in `security.md` §13.