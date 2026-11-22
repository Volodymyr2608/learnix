-- Refund slice 8 /qa: an appeal closed by another refund (review I2) and the approval time (review I1).

-- AlterEnum (IF NOT EXISTS: a first attempt of this migration may have added it before failing)
ALTER TYPE "AppealStatus" ADD VALUE IF NOT EXISTS 'closed_refunded';

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN "approved_at" TIMESTAMP(3);

-- Every approval so far happened when its request was created (automatic approvals).
UPDATE "refund_requests" SET "approved_at" = "created_at" WHERE "approval" IS NOT NULL;
