-- Concept identity: one comparison rule, stored and indexed.
--
-- This function mirrors `conceptKey()` in
-- `server/services/_shared/concepts/conceptKey.ts`, and the two must agree on
-- every input — `conceptMastery.keyParity.integration.test.ts` asserts it over a
-- corpus and over every value in the table. Where they diverge, two distinct
-- rows map to one key and a write binds to the wrong row.
--
--   * The character class is POSIX `[[:space:]]`, spelled out, and deliberately
--     not JS `\s`: `\s` additionally matches U+00A0 and U+2009.
--   * `COLLATE "C"` makes `lower()` fold ASCII only, the largest range on which
--     every collation agrees. `lower('İ')` under a UTF-8 locale yields a bare
--     `i`, while `"İ".toLowerCase()` expands to `i` + U+0307.
CREATE OR REPLACE FUNCTION concept_key(raw text) RETURNS text AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(raw, '^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$', '', 'g'),
      '[ \t\n\v\f\r]+', ' ', 'g'
    ) COLLATE "C"
  )
$$ LANGUAGE sql IMMUTABLE STRICT;

ALTER TABLE "concept_mastery" ADD COLUMN "conceptKey" TEXT;

UPDATE "concept_mastery" SET "conceptKey" = concept_key(concept);

-- Archive every row of every colliding group before the merge deletes any of
-- them. Rollback is `INSERT ... SELECT` from this table. It is dropped on a
-- dated schedule with a named owner, not by this migration.
CREATE TABLE "concept_mastery_archive_merge" (
  LIKE "concept_mastery" INCLUDING DEFAULTS
);

ALTER TABLE "concept_mastery_archive_merge"
  ADD COLUMN "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

INSERT INTO "concept_mastery_archive_merge"
  (id, "studentId", "courseId", concept, "conceptKey", level, evidence, "updatedAt")
SELECT m.id, m."studentId", m."courseId", m.concept, m."conceptKey", m.level, m.evidence, m."updatedAt"
FROM "concept_mastery" m
JOIN (
  SELECT "studentId", "courseId", "conceptKey"
  FROM "concept_mastery"
  GROUP BY "studentId", "courseId", "conceptKey"
  HAVING COUNT(*) > 1
) dup USING ("studentId", "courseId", "conceptKey");

-- The survivor of a colliding group is the latest `updatedAt`, with `id` as a
-- total tie-break so two runs against one snapshot keep the same rows. Its own
-- spelling is therefore already "the spelling of the latest updatedAt" and needs
-- no assignment; what it inherits from the group is the highest level, and the
-- evidence belonging to that level rather than to itself.
WITH grouped AS (
  SELECT
    "studentId",
    "courseId",
    "conceptKey",
    MAX(level) AS max_level,
    (ARRAY_AGG(id ORDER BY "updatedAt" DESC, id DESC))[1] AS keep_id,
    (ARRAY_AGG(evidence ORDER BY level DESC, "updatedAt" DESC, id DESC))[1] AS keep_evidence
  FROM "concept_mastery"
  GROUP BY "studentId", "courseId", "conceptKey"
  HAVING COUNT(*) > 1
)
UPDATE "concept_mastery" m
SET level = g.max_level,
    evidence = g.keep_evidence
FROM grouped g
WHERE m.id = g.keep_id;

DELETE FROM "concept_mastery" m
USING (
  SELECT
    "studentId",
    "courseId",
    "conceptKey",
    (ARRAY_AGG(id ORDER BY "updatedAt" DESC, id DESC))[1] AS keep_id
  FROM "concept_mastery"
  GROUP BY "studentId", "courseId", "conceptKey"
  HAVING COUNT(*) > 1
) g
WHERE m."studentId" = g."studentId"
  AND m."courseId" = g."courseId"
  AND m."conceptKey" = g."conceptKey"
  AND m.id <> g.keep_id;

-- Post-conditions, asserted rather than eyeballed. The unique index below would
-- fail on duplicates anyway; this reports which invariant broke.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "concept_mastery"
    GROUP BY "studentId", "courseId", "conceptKey"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'concept_mastery still holds duplicate (studentId, courseId, conceptKey) rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "concept_mastery"
    WHERE "conceptKey" IS DISTINCT FROM concept_key(concept)
  ) THEN
    RAISE EXCEPTION 'concept_mastery.conceptKey disagrees with concept_key(concept)';
  END IF;
END $$;

ALTER TABLE "concept_mastery" ALTER COLUMN "conceptKey" SET NOT NULL;

CREATE UNIQUE INDEX "concept_mastery_studentId_courseId_conceptKey_key"
  ON "concept_mastery"("studentId", "courseId", "conceptKey");