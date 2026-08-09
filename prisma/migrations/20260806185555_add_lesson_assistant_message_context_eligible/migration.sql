-- AlterTable
ALTER TABLE "lesson_assistant_messages" ADD COLUMN     "contextEligible" BOOLEAN NOT NULL DEFAULT true;

-- Existing rows default to eligible, and there is no backfill: the guard outcome
-- was never persisted, so historical off-topic turns cannot be identified after
-- the fact. The boundary holds from this migration forward. This is a recorded
-- limitation, not an omission.
