-- Attempt bookkeeping for quiz-answer-key: one row per (quiz, student), a
-- counter that survives a retry, and a timestamp the cooldown can read.
--
-- Step 1 collapses pre-existing duplicates. `submit()` did read-then-write with
-- no unique constraint, so two concurrent submissions of the same quiz left two
-- rows; the unique index in step 4 cannot be created while any pair survives.
-- The losing rows are archived in the same statement that deletes them, because
-- the delete is irreversible and an attempt row is the evidence of record.
--
-- Selection is total and deterministic: a correct attempt outranks a wrong one,
-- then the newest, then the highest id. `quiz_attempts_archive_dedupe` is read
-- by nothing — it exists so the collapse can be audited after the fact.

-- >>> dedupe (replayed against a clone by quizAttempt.repository.integration.test.ts) >>>
CREATE TABLE "quiz_attempts_archive_dedupe" (LIKE "quiz_attempts");

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "quizId", "studentId"
    ORDER BY "isCorrect" DESC, "createdAt" DESC, id DESC
  ) AS rn
  FROM "quiz_attempts"
), deleted AS (
  DELETE FROM "quiz_attempts"
  WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  RETURNING *
)
INSERT INTO "quiz_attempts_archive_dedupe" SELECT * FROM deleted;
-- <<< dedupe <<<

-- Step 2: the counter. Deliberately NOT backfilled — the old code overwrote the
-- attempt row in place, so count(*) per pair is 1 however many times the student
-- retried. NULL is the truthful value: this row's attempt history is unknown.
ALTER TABLE "quiz_attempts" ADD COLUMN "attemptCount" INTEGER;

-- Step 3: the cooldown clock. Backfilled from `createdAt` rather than NOW():
-- it is the only timestamp these rows carry, and it is a lower bound, so a
-- legacy row can never start a cooldown that the student did not earn.
ALTER TABLE "quiz_attempts" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "quiz_attempts" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "quiz_attempts" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Step 4: one attempt row per (quiz, student), enforced by the database rather
-- than by read-then-write in the service.
CREATE UNIQUE INDEX "quiz_attempts_quizId_studentId_key" ON "quiz_attempts"("quizId", "studentId");