-- AlterTable
ALTER TABLE "instructor_profiles" ADD COLUMN     "reviews_last_viewed_at" TIMESTAMP(3);

-- Backfill existing instructors so historical reviews are not counted as "new".
UPDATE "instructor_profiles"
SET "reviews_last_viewed_at" = NOW()
WHERE "reviews_last_viewed_at" IS NULL;
