---
feature: account-deletion-data-retention
status: planned
models: [User, Course, Payment, CourseGeneration, Post]
depends-on: [payments, certificates, messages]
---

## Purpose

Deleting an account is currently destructive to people who did not ask for it, and lossy in a way
that costs money.

Every one of the 20 relations pointing at `User` carries `onDelete: Cascade`, so removing the `User`
row is a wide, silent delete. Three consequences, all verified against the schema:

- **It destroys other people's data.** Deleting an instructor cascades through `Course` into every
  enrolled student's `Enrollment`, `CourseProgress`, `CourseReview` and `ConceptMastery`. Article 17
  gives a person the right to erase *their* data, not their students'.
- **It destroys financial records, including money in flight.** `Payment` cascades from three
  directions — `studentId`, `courseId`, `instructorId`. A student deleting their account removes
  payment rows, and a row with `transferStatus: pending` is money owed to an instructor that the
  sweep (`payment.ts:136`, `connect.service.ts:169`) has not yet transferred. The instructor is
  simply never paid, and no trace remains. Separately, GDPR Art. 17(3)(b) and (e) *require*
  retaining records held for a legal (accounting) obligation — so the current behaviour deletes
  what the law says to keep.
- **It leaves the most sensitive text behind.** `CourseGeneration.instructorId` is a bare `String`
  with no foreign key at all, so its rows — and, through their own cascade,
  `CourseGenerationMessage.content` holding the instructor's full AI conversation — survive
  deletion as orphans, indefinitely.

The mitigation in place today does not work. `better-auth/config.ts:71-78` soft-deletes the
instructor's courses in `beforeDelete`, commented "so enrolled students retain access to their
course history (FR5)". The `User` row is deleted moments later and the FK cascade removes those same
courses physically. The soft-delete is a no-op and the stated guarantee is not delivered.

## Functional scope

**1. Deletion anonymises the principal instead of removing the row.** "Delete my account"
irreversibly overwrites the identifying fields on the `User` row — `name` becomes a fixed
placeholder, `email` becomes `deleted-<userId>@system.invalid`, `image` is cleared — and destroys
every credential (`Session`, `Account`). The row itself is retained.

The row is what every foreign key and four unique constraints depend on
(`review [courseId, studentId]`, `message [studentId, instructorId, courseId]`,
`course_progress [studentId, courseId]`, `learning_path_cache [studentId, courseId]`). Retaining it
means no cascade fires, no constraint is violated by a shared tombstone, and no read path has to
learn about a nullable instructor. Once the identifying fields are gone the remaining rows are
anonymous data, which GDPR Recital 26 places outside the regulation entirely.

**2. What is destroyed is content the person authored privately; what is retained is a structured
fact about an anonymous principal.** This is the rule that decides every table, and it replaces the
weaker question "is this row personal?" — after anonymisation, linkage is no longer the risk;
free text the person wrote about themselves is.

Destroyed outright:

| Data | Why |
|---|---|
| `Session`, `Account` | credentials — retaining them would make the anonymisation reversible |
| `LessonAssistantConversation` + its messages | free text the student wrote to the tutor, including anything disclosed about themselves |
| `CourseGeneration` + `CourseGenerationMessage` | same, for the instructor's AI course-builder chat |
| `InstructorProfile` | biography and headline — authored self-description |
| `UserInterestEmbedding` | a behavioural profile, derived solely from this person |
| `Notification` | addressed to the person, of no value to anyone else |

Retained, now pointing at an anonymous principal:

| Data | Why |
|---|---|
| `Payment` | legal retention obligation; also the only record of an untransferred balance |
| `Course`, `Section`, `Lesson`, `Quiz` | the instructor's published work, which enrolled students paid for |
| `Enrollment`, `CourseProgress`, `LessonProgress`, `QuizAttempt`, `ConceptMastery` | structured facts; `Enrollment` in particular is what a certificate is derived from (see 3) |
| `CourseReview` | published content that other buyers rely on; removing it silently moves the course rating |
| `Conversation`, `Message` | the counterparty's own correspondence, including their replies |

**3. Certificates keep verifying.** There is no `Certificate` model —
`certificate.service.ts:12-13` renders a PDF from an `Enrollment` via
`enrollmentRepository.findByIdWithRelations`, and `findCompletedByStudent` lists them. Retaining
`Enrollment` is therefore the mechanism by which an already-issued certificate stays verifiable;
there is no certificate row to anonymise.

**4. Cascades that must never fire again are downgraded to `Restrict`.** Every relation in the
"retained" table above moves from `onDelete: Cascade` to `onDelete: Restrict`. Deletion is now an
explicit, ordered service operation, so a future code path that deletes a `User` row directly should
fail loudly on a foreign key rather than silently removing a paid course. `CourseGeneration.instructorId`
gains the foreign key it never had, with `Cascade`, because its rows are destroyed anyway.

**5. `Post` is deleted from the schema.** It is an unused T3 scaffold leftover with no repository,
service, or router referencing it, and its `createdBy` relation declares no `onDelete` — Prisma's
default for a required relation is `Restrict`, so a single `Post` row would block account deletion
outright. It is removed rather than fixed.

**6. The account-deletion UX is unchanged.** Email-confirmation flow, the danger-zone panel, and the
wording all stay as they are. Better Auth's `deleteUser` is what changes: it removes the row, which
this design must not do, so deletion is handled by an application procedure instead.

**Out of scope:** erasing `userId` from security-event logs and from LangSmith traces (both live
outside the database, and neither has a retention policy yet — that is task З6 in
`docs/tech-review-prep/area-1.md`); an admin-facing "restore account" flow (anonymisation is
deliberately irreversible); exposing the quiz answer key to the client
(`quiz.service.ts:82-84`, a separate finding); back-filling anonymised rows for accounts deleted
before this ships (there are none in production).

## Acceptance criteria

**Anonymisation**

- After deletion the `User` row still exists, and its `name`, `email` and `image` no longer contain
  any value they held before.
- The anonymised `email` is unique per deleted account, so two deletions never collide on
  `auth.prisma:39 @@unique([email])`.
- No `Session` or `Account` row referencing the deleted user survives; the person cannot sign in
  again, and neither an OAuth provider nor a password reset re-attaches to the row.
- Deleting a second account that reviewed the same course, messaged the same instructor about the
  same course, or has progress on the same course succeeds — none of the four unique constraints is
  violated.

**Nothing belonging to someone else is destroyed**

- Deleting an instructor with an enrolled student leaves the course, its sections and lessons, and
  that student's `Enrollment`, `CourseProgress` and `ConceptMastery` rows intact.
- The student can still open the course and its lessons afterwards.
- Deleting a student leaves every `Payment` row referencing them, with `amountCents`,
  `transferStatus`, `stripeTransferId` and `stripePaymentIntentId` unchanged.
- Deleting a student with a `transferStatus: pending` payment leaves that payment visible to the
  transfer sweep, and the instructor is still paid.
- Deleting either party to a conversation leaves the thread and both sides' message bodies readable
  by the remaining party.
- A course's average rating is the same immediately before and after one of its reviewers deletes
  their account.
- A certificate issued before deletion still renders afterwards.

**Private authored content is destroyed**

- No `LessonAssistantConversation`, `LessonAssistantMessage`, `CourseGeneration`,
  `CourseGenerationMessage`, `InstructorProfile`, `UserInterestEmbedding` or `Notification` row
  referencing the deleted user survives.
- In particular a `CourseGeneration` row is destroyed, which is only reachable once the foreign key
  exists.

**The cascade cannot come back**

- Attempting to delete a `User` row directly through Prisma, for a user who has a course, a payment,
  a review, a conversation or an enrollment, raises a foreign-key error instead of succeeding.
- No `Post` model remains in `prisma/schema/`.

**Atomicity**

- The whole operation runs in one transaction: a failure partway leaves the account fully intact and
  still able to sign in, not partly anonymised.

## Agent notes

- **The retained/destroyed split is not "is it personal data".** After anonymisation nothing links a
  row to a person, so the surviving question is authorship: free text the person wrote about
  themselves is destroyed, structured facts are kept. Applying the older instinct ("delete anything
  with `studentId`") reintroduces the third-party destruction this feature exists to stop.
- **`Enrollment` is load-bearing for certificates**, and this is invisible from its name. There is no
  `Certificate` table; `certificate.service.ts` derives the PDF from an enrollment. Deleting
  enrollments on account deletion silently breaks every previously issued certificate.
- **`Payment` cascades from three directions**, not two — `studentId`, `instructorId` *and*
  `courseId`. Downgrading only the two user-facing ones still leaves the course path able to destroy
  financial records.
- **A pending transfer is money, not state.** `transferStatus: pending` means the sweep has not yet
  moved funds to the instructor. Any future change that deletes payment rows must reckon with the
  balance they represent.
- **Anonymisation must be irreversible to be worth anything.** If a future feature reconstructs the
  original email (from Stripe customer records, an audit log, or an email-delivery log), the
  remaining rows stop being anonymous and re-enter GDPR scope. The `deleted-<userId>@system.invalid`
  form deliberately derives from the row id and nothing else.
- **Accepted residual risk:** retained rows could in principle re-identify someone by combination —
  a niche course, a timestamp, and review prose. This is accepted rather than solved; the
  alternative (destroying reviews and payments) breaks the guarantees above. It belongs in
  `security.md` §13.
- **`beforeDelete` in `better-auth/config.ts` is a trap for a future reader.** Its soft-delete of
  instructor courses looks protective and does nothing, because the cascade that follows removes the
  courses regardless. It is removed by this feature; do not reinstate the pattern.
- **`onDelete: Restrict` makes tests noisier.** Fixtures that tear down by deleting users will start
  failing; `test/db.ts` `truncateAll()` already truncates tables directly and is unaffected.
- This is **complex tier** — it touches money (`Payment`), the auth model (account deletion), and a
  migration that is expensive to undo on live data. **An ADR is required at the `/qa` gate**, and the
  decision worth recording is anonymise-in-place versus a per-deletion tombstone user, including why
  a single shared tombstone is not viable (it violates four unique constraints).