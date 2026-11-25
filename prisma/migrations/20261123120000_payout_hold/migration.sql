
-- CreateEnum
CREATE TYPE "PayoutRunTrigger" AS ENUM ('cron', 'manual', 'account_updated');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransferStatus" ADD VALUE 'transferring';
ALTER TYPE "TransferStatus" ADD VALUE 'cancelled';

-- CreateTable
CREATE TABLE "payout_runs" (
    "id" TEXT NOT NULL,
    "trigger" "PayoutRunTrigger" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "processed" INTEGER NOT NULL DEFAULT 0,
    "released" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "payment_ids" TEXT[],

    CONSTRAINT "payout_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_runs_started_at_idx" ON "payout_runs"("started_at");

-- CreateIndex
CREATE INDEX "payments_transfer_status_paid_at_idx" ON "payments"("transfer_status", "paid_at");


-- Backfill (plan H6): finalizeCheckout no longer retries a transfer for a succeeded payment left at
-- `none`; that retry was these rows' only path to payment. They become `pending`, so the release
-- job pays them under the same predicate as every other sale.
UPDATE "payments" SET "transfer_status" = 'pending'
 WHERE "status" = 'succeeded'
   AND "transfer_status" = 'none'
   AND "instructor_net_cents" > 0
   AND "refunded_at" IS NULL;
