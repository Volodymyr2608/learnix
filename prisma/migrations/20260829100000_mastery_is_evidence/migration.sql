-- A mastery row now means "this student proved this concept, and here is how".
--
-- Levels 0 and 1 said neither. They recorded exposure — that a lesson mentioning
-- the concept had been seen — which the learning path derives at read time from
-- data it already loads. Keeping them as durable rows made "has mastery" and
-- "has been exposed" the same query, which is how a concept the student had
-- merely encountered came to count as one they had demonstrated.
--
-- Order matters and is not interchangeable:
--   archive -> delete -> add enum value -> backfill -> SET NOT NULL -> add CHECK
-- The CHECK is last because it fails against the pre-delete rows, and the
-- backfill is before SET NOT NULL because the column is nullable today.
--
-- MUST DEPLOY WITH the derived-level-1 union in the learning path's reader. The
-- delete alone does not degrade these concepts to level 1: today's reader builds
-- the weak set only from persisted rows, so they would vanish from review
-- entirely — the opposite of the invariant this delete is justified by.

-- Archive first. Rollback is `INSERT ... SELECT` from this table; it is dropped
-- on a dated schedule with a named owner, not by this migration.
CREATE TABLE "concept_mastery_archive_le2" (
  LIKE "concept_mastery" INCLUDING DEFAULTS
);

ALTER TABLE "concept_mastery_archive_le2"
  ADD COLUMN "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

INSERT INTO "concept_mastery_archive_le2"
  (id, "studentId", "courseId", concept, "conceptKey", level, evidence, "updatedAt")
SELECT id, "studentId", "courseId", concept, "conceptKey", level, evidence, "updatedAt"
FROM "concept_mastery"
WHERE level <= 1;

DELETE FROM "concept_mastery" WHERE level <= 1;

-- The fifth member. `ALTER TYPE ... ADD VALUE` cannot run in the same
-- transaction as a statement that uses the new value on some PostgreSQL
-- versions, which is why the backfill below writes LEGACY and never
-- APPLIED_CHECK: nothing has been earned by a check yet.
ALTER TYPE "MasteryEvidence" ADD VALUE IF NOT EXISTS 'APPLIED_CHECK';

-- Every remaining NULL predates the evidence column. Its level was earned, but
-- how is unknowable — possibly by reading an answer key that used to ship with
-- the questions — so it is labelled LEGACY rather than given a story. This must
-- not touch QUIZ_RETRIED, QUIZ_FIRST_PASS or CONVERSATION: they already say
-- something true.
UPDATE "concept_mastery" SET evidence = 'LEGACY' WHERE evidence IS NULL;

ALTER TABLE "concept_mastery" ALTER COLUMN evidence SET NOT NULL;

-- Last. Against the pre-delete rows this fails; against the post-delete table it
-- makes "a row that is not evidence" unrepresentable rather than merely absent.
ALTER TABLE "concept_mastery"
  ADD CONSTRAINT "concept_mastery_level_is_evidence" CHECK (level IN (2, 3));
