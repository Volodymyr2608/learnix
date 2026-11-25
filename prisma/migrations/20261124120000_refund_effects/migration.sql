
-- CreateEnum
CREATE TYPE "CertificateRevocationReason" AS ENUM ('refund_request', 'dashboard_refund', 'admin_exception', 'lost_dispute');

-- CreateEnum
CREATE TYPE "RefundState" AS ENUM ('processing', 'refunded');

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "certificate_revoked_at" TIMESTAMP(3),
ADD COLUMN     "certificate_revoked_reason" "CertificateRevocationReason";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "closed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payout_runs" ADD COLUMN     "events_replayed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refunds_retried" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN     "refund_error" TEXT,
ADD COLUMN     "refund_state" "RefundState",
ADD COLUMN     "refunded_at" TIMESTAMP(3),
ADD COLUMN     "stripe_refund_id" TEXT;

-- CreateTable
CREATE TABLE "study_archive" (
    "student_id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "lessons" INTEGER NOT NULL,

    CONSTRAINT "study_archive_pkey" PRIMARY KEY ("student_id","day")
);

-- CreateTable
CREATE TABLE "stripe_replay_cursors" (
    "id" TEXT NOT NULL,
    "last_event_created" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_replay_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_stripe_refund_id_key" ON "refund_requests"("stripe_refund_id");


-- Backfill (plan R10): slice 1 approved requests without making a refund; they are refunds still
-- to be made, so the daily job's retry picks them up. Production has none (the flag is off).
UPDATE "refund_requests" SET "refund_state" = 'processing'
 WHERE "decision" = 'auto_approved' AND "refund_state" IS NULL;
