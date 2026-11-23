-- Refund slice 9 /qa: a reversed request ("the sale stands") and the failed refund a bank failure belongs to.

-- AlterEnum
ALTER TYPE "RefundState" ADD VALUE IF NOT EXISTS 'reversed';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bank_failure_refund_id" TEXT;

-- AlterTable
ALTER TABLE "refund_evidence_files" ADD COLUMN     "delete_attempted_at" TIMESTAMP(3);
