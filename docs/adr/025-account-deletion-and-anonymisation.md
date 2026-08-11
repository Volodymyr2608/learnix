# ADR-025: Account Deletion and In-Place Anonymisation

- **Status**: Accepted
- **Date**: 2026-08-10

## Context

Account deletion in the previous design cascade-deleted from a `User` row across 20 relations, destroying
other people's data and financial records:

1. **Third-party destruction**: Deleting an instructor cascaded through `Course` into every enrolled
   student's `Enrollment`, `CourseProgress`, `CourseReview` and `ConceptMastery`, destroying data
   they did not ask to erase. Article 17 (GDPR) grants the right to erase *their* data, not others'.

2. **Financial loss**: `Payment` cascaded from three directions (`studentId`, `courseId`,
   `instructorId`). A student deleting their account removed payment rows, including any marked
   `transferStatus: pending` — money owed to an instructor that the sweep had not yet transferred.
   GDPR Art. 17(3)(b) and (e) *require* retaining records held for a legal obligation, yet the
   deletion was destroying them.

3. **Orphaned sensitive transcripts**: `CourseGeneration.instructorId` had no foreign key at all, so
   the instructor's AI course-builder conversation (`CourseGenerationMessage.content`) survived
   deletion as orphans indefinitely.

A soft-delete mitigation existed in `better-auth/config.ts` (soft-deleting instructor courses in
`beforeDelete`), but it was a no-op: the cascade removed those same courses moments later.

The three axes to solve this were: *what to destroy*, *what to keep*, and *how to interpose the
decision without the cascade firing*.

## Decision

**Replace destructive account deletion with irreversible in-place anonymisation.** The `User` row
is retained with identifying fields overwritten; credentials and privately-authored content are
destroyed; structured facts and financial records are retained, now pointing at an anonymous
principal.

### Why anonymise in place, not a shared tombstone user

A per-deletion **shared tombstone** account (a single `User` row with a fixed
`email = "deleted@system.invalid"`) was rejected because it violates four unique constraints:

| Constraint | Violation |
|---|---|
| `review.prisma:29` | `@@unique([courseId, studentId])` — two different students cannot both have a review on the same course after deletion if both resolve to the same tombstone userId |
| `message.prisma:18` | `@@unique([conversationId, studentId, instructorId])` — two conversations for the same course cannot coexist if both deleted parties map to one tombstone |
| `course.prisma:67` | `@@unique([instructorId, slug])` — two deleted instructors cannot both have retained a course with the same slug if they share one tombstone userId |
| `course.prisma:101` | `@@unique([instructorId, title])` — likewise for course title |

**Anonymise-in-place** sidesteps this: each deleted user retains their own row with a **random,
unique placeholder email**. The row id is immutable, so no constraint is violated.

### Why the placeholder email is random, not derived from the user id

The anonymised email takes the form `deleted-<random-UUID>@system.invalid`. A derived form (e.g.
`deleted-<userId>@system.invalid`) was rejected because it creates an address-prediction attack:

- `Message.senderId` sends the raw `userId` to the counterparty (`server/services/messaging/messaging.service.ts:102`).
- An attacker who was ever messaged by the victim can predict the anonymised email: `deleted-<userId>@system.invalid`.
- The attacker can then register an ordinary account at that address and permanently block the victim's
  deletion on the `users.email` unique constraint.
- The random form prevents this. It also prevents the retained row from carrying the original id as
  a correlation handle.

The `.invalid` TLD (RFC 2606, guaranteed unroutable) is load-bearing: better-auth's password-reset
flow reconstructs a credential account for any address that can receive mail, so a guessable
placeholder must be undeliverable.

### The two-hook Better Auth interception and its version coupling

Deletion is intercepted at two different points in the `better-auth` flow, each serving a different
purpose:

#### `user.deleteUser.beforeDelete` — runs the anonymisation transaction first

Called at `node_modules/better-auth/dist/api/routes/update-user.mjs:365-366`, immediately
**before** `internalAdapter.deleteUser`. This hook:

- **Runs the anonymisation in an atomic transaction**, destroying credentials and private content,
  scrubbing the instructor profile, and overwriting identifying fields.
- **Cannot stop the row delete on its own** — the call to `internalAdapter.deleteUser` at line 367
  is unconditional regardless of what the hook returns.
- **Can abort the whole request by throwing**, leaving the account fully intact with all original
  fields and credentials still able to sign in.

This ordering is critical: `internalAdapter.deleteUser` deletes sessions (`:129-132`) and accounts
(`:133-136`) *before* it reaches the user delete at `:137-140`. Putting the anonymisation in the
database hook would run it *after* credentials were already destroyed outside our transaction,
violating the Atomicity criterion.

#### `databaseHooks.user.delete.before` — returns `false` to skip the row delete

The database hook is the actual veto. `deleteWithHooks` (`dist/db/with-hooks.mjs:101-108`) reads:

```js
if (await toRun(entityToDelete, context) === false) return null;
const deleted = ... await (await getCurrentAdapter(adapter)).delete({ model, where }) ...
```

Returning **exactly `false`** (not `undefined`, not truthy) returns early and the adapter's
`delete()` never runs. The row is retained; the `beforeDelete` hook has already anonymised it.

**Version coupling:** This is pinned to **better-auth 1.5.4**. The `with-hooks.mjs` implementation
must be re-verified on every upgrade: if the equality check changes to `!== true` or to `== false`
(loose), the veto silently stops working and the cascade fires again, destroying the feature's
guarantee. Record in the upgrade checklist: re-verify `dist/db/with-hooks.mjs:101-108` compares
with `===`.

### The fourteen Cascade → Restrict downgrades

Fourteen relations on the `User` deletion path move from `onDelete: Cascade` to `onDelete: Restrict`:

| Model | Field | Cascade destination |
|---|---|---|
| `Course` | `instructorId` | course, curriculum (section, lesson, quiz) |
| `CourseProgress` | `studentId` | per-student progress |
| `LessonProgress` | `studentId` | per-lesson progress |
| `QuizAttempt` | `studentId` | quiz attempts |
| `Enrollment` | `studentId` | enrollment records |
| `CourseReview` | `studentId` | published reviews |
| `ConceptMastery` | `studentId` | mastery records |
| `InstructorProfile` | `userId` | instructor bio and payout account |
| `Payment` | `studentId`, `courseId`, `instructorId` | financial records (three paths) |
| `Conversation` | `studentId`, `instructorId` | message threads (two paths) |
| `Message` | `senderId` | individual messages |

**Why `Restrict`, not softdelete**: Soft-delete would allow reads (violating the purpose of the feature
— the instructor's content is *retained*, not hidden). `Restrict` makes a future code path that deletes
a `User` row directly fail loudly on a foreign key rather than silently removing a paid course. This is
a structural guarantee, not a runtime check.

**Payment.courseId → Restrict is safe** because the only production course deletion is in
`server/api/routers/course.ts:62`, which calls `courseRepository.deleteCourse(input, true)` — an
explicit soft delete, not a hard delete.

**Course-internal cascades stay `Cascade`** (`Section.courseId`, `Lesson.sectionId`, `Quiz.lessonId`,
and their children) because they support normal curriculum editing and are not on the `User`
deletion path.

### The InstructorProfile payout finding

The `InstructorProfile` row for a deleted instructor is **scrubbed, not destroyed**: the authored
free text (`professionalBio`, `courseIdea`, `teachingExperience`, `areaOfExpertise`, `phone`,
`linkedinUrl`, `websiteUrl`) is blanked, but `stripeAccountId`, `stripeChargesEnabled`,
`stripePayoutsEnabled`, and `stripeOnboardedAt` are retained.

**Why**: The payout sweep (`server/services/payments/connect.service.ts:119-128`) resolves an
instructor's Stripe Connect account through this row:

```ts
const profile = await instructorProfileRepository.findFirst({
  where: { userId: payment.instructorId }
});
if (!profile?.stripeAccountId) {
  // stripeAccountId missing → mark pending, return
  return;
}
// Use stripeAccountId for the transfer
```

Destroying the profile permanently strands every pending transfer owed to a deleting instructor —
the precise failure the feature exists to stop. Scrubbing in place satisfies the spec's own rule:
free text the person wrote about themselves is destroyed; structured facts (the payout account
reference) are kept.

This is a trade, not a clean win. `stripeAccountId` points at a Connect account holding the person's
legal name, date of birth and bank details, and nothing clears it once the money is settled — so the
retained row stays linkable to a real identity through Stripe indefinitely. It is recorded as an
accepted risk with a named follow-up (a settle-and-clear sweep) in
[`security.md`](../specs/features/account-deletion-data-retention/security.md) S13.

## Consequences

**Positive:**

- No cascade fires on account deletion. Enrolled students keep their courses, progress, and
  certificates. Instructors keep their earnings.
- The `User` row is retained, so no foreign key is violated and no unique constraint can be broken
  by a second deletion.
- Credentials are destroyed (session, account, verification tokens), so the account cannot be
  resurrected or re-used.
- The anonymised email is random and undeliverable, so OAuth auto-link and password reset cannot
  rebuild the account.
- The operation is atomic: a failure rolls back the whole transaction, leaving the account able to
  sign in and retry.

**Negative / accepted tradeoffs:**

- Retained rows (`CourseReview.comment`, `Message.body`, `Course` titles/descriptions) could in
  principle re-identify someone by combination — a niche course, a timestamp, and review prose.
  Documented as a residual risk in
  [`security.md`](../specs/features/account-deletion-data-retention/security.md) S13, with concrete
  visibility (who reads what, when).
- `User.id` is unchanged and still keys every retained relation, so anyone who recorded it before
  deletion keeps a stable handle for correlating those rows. A counterparty can read it directly
  from `Message.senderId`. The id cannot be rotated without breaking every retained relation, so
  this is accepted rather than mitigated.
- `InstructorProfile` payout fields carry `stripeAccountId` (resolving to the person's legal name
  and DOB at Stripe). They survive indefinitely with **no settle-and-clear path** — a named
  follow-up is needed: a batch sweep that nulls `stripeAccountId` once no `transferStatus: pending`
  payments remain for that instructor.

## Alternatives considered

- **Destroy the `User` row (the previous approach)** — simple, but cascades into third-party data
  and financial records. Rejected per the Context section.
- **Soft-delete the `User` row** — preserves the row, but leaves all data visible to future queries
  that exclude deleted rows. Doesn't anonymise.
- **A single shared tombstone user** — reduces storage, but violates four unique constraints (see
  Decision). Rejected.
- **Soft-delete instructor courses only** — the previous mitigation. No-op: the user cascade
  removes them anyway.
- **Destroy everything except Payment** — would preserve financial records but destroy instructors'
  published work, courses, and student progress. Breaks the feature's core guarantee.

## References

- [`docs/specs/features/account-deletion-data-retention/spec.md`](../specs/features/account-deletion-data-retention/spec.md) — the feature spec with Acceptance criteria and Agent notes.
- `server/repositories/user.repository.ts:66-142` — `anonymiseAccount` implementation.
- `server/better-auth/accountDeletion.hooks.ts` — the two hook functions.
- `server/better-auth/config.ts` — integration into better-auth config.
- `server/repositories/user.repository.integration.test.ts` — full integration test suite.
- [`security.md`](../specs/features/account-deletion-data-retention/security.md) — S13, residual
  re-identification risks and accepted tradeoffs.
- GDPR Art. 17 (right to erasure), Art. 17(3)(b) and (e) (legal obligations), Recital 26 (anonymous data).