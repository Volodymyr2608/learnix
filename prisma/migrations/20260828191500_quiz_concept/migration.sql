-- The concept a question tests, so passing a quiz promotes what it actually
-- tested rather than every concept the lesson mentions.
--
-- Nullable and left NULL for every existing row: a legacy quiz has no evidence
-- of what it tested, and inventing one would manufacture exactly the provenance
-- this column exists to record. Untagged quizzes keep lesson-wide promotion.
ALTER TABLE "quizzes" ADD COLUMN "concept" TEXT;