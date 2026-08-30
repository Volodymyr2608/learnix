-- A question is asked once.
--
-- spec.md requires that a retry after the cooldown "is not normalisation-equal
-- to any previous one". That rule cannot live in the model: the authored check
-- is deliberately kept out of `toolCalls`, the tool result is a bare
-- acknowledgement, and history replays content only — so on the retry turn the
-- model has no memory of what it asked. Meanwhile the student was told the
-- answer to the question they got wrong. Without a server-side rule the three
-- attempts the budget allows are not three independent draws.
--
-- The key is `concept_key()` — the same IMMUTABLE function that keys concept
-- identity, created in 20260828190000. One normalisation rule, used everywhere,
-- so TypeScript and SQL cannot disagree about what "the same question" is.

ALTER TABLE "concept_checks" ADD COLUMN "questionKey" TEXT;

UPDATE "concept_checks" SET "questionKey" = concept_key(question);

ALTER TABLE "concept_checks" ALTER COLUMN "questionKey" SET NOT NULL;

-- Serves the repeat lookup, and the per-concept budget count that shares its
-- leading columns.
CREATE INDEX "concept_checks_studentId_conceptKey_questionKey_idx"
  ON "concept_checks" ("studentId", "conceptKey", "questionKey");

-- No row may exist without a key: the backfill covered every existing row, and
-- every writer computes it. A NULL here would silently disable the rule.
DO $$
DECLARE unkeyed bigint;
BEGIN
  SELECT count(*) INTO unkeyed FROM "concept_checks" WHERE "questionKey" IS NULL;
  IF unkeyed > 0 THEN
    RAISE EXCEPTION 'concept_checks: % row(s) left without a questionKey', unkeyed;
  END IF;
END $$;
