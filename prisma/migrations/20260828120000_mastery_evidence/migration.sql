-- Provenance for a mastery level (docs/specs/features/quiz-answer-key).
--
-- Existing rows are left in place and left NULL (decision D-A). A level-3 row
-- written before this change may have been earned by reading an answer key that
-- shipped with the questions; attribution is impossible — a network-tab reader
-- and a competent student are indistinguishable in the data — and downgrading
-- real achievement to erase a hypothetical is the worse error. NULL is the
-- cutoff a future credentialing consumer can exclude on.

CREATE TYPE "MasteryEvidence" AS ENUM ('CONVERSATION', 'QUIZ_FIRST_PASS', 'QUIZ_RETRIED', 'LEGACY');

ALTER TABLE "concept_mastery" ADD COLUMN "evidence" "MasteryEvidence";
