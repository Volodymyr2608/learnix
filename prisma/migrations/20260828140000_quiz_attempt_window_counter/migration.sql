-- Splits the attempt counter in two (docs/specs/features/quiz-answer-key).
--
-- `attemptCount` was serving two jobs: the window counter the cap compares
-- against, and the lifetime counter a promotion reads to decide whether every
-- quiz was answered on the first try. The cooldown reset it, so the lifetime
-- fact was destroyed by the window reset — a student who exhausted three
-- attempts, waited a day and then submitted the last option was recorded as
-- QUIZ_FIRST_PASS, the strongest provenance marker in the enum, for an answer
-- reached purely by elimination.
--
-- `attemptCount` is now the lifetime count and is never reset. `windowCount` is
-- the one the cooldown restarts.

ALTER TABLE "quiz_attempts" ADD COLUMN "windowCount" INTEGER;

-- Rows written since the counter shipped have spent no cooldown yet, so their
-- window count is their attempt count. Rows that predate the counter stay NULL
-- in both: unknown history is not a spent window, and inventing one here would
-- be the same fabrication the counter's own backfill was refused for.
UPDATE "quiz_attempts" SET "windowCount" = "attemptCount" WHERE "attemptCount" IS NOT NULL;
