-- Refund slice 9 (W1): fee, refunded amount, bank failure, and the enum values the new paths need.

-- AlterEnum
ALTER TYPE "CertificateRevocationReason" ADD VALUE IF NOT EXISTS 'duplicate_charge';

-- AlterEnum
ALTER TYPE "RefundSource" ADD VALUE IF NOT EXISTS 'duplicate_charge';

-- AlterEnum
ALTER TYPE "AppealStatus" ADD VALUE IF NOT EXISTS 'closed_account_deleted';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundAuditKind" ADD VALUE IF NOT EXISTS 'bank_failure_refunded_elsewhere';
ALTER TYPE "RefundAuditKind" ADD VALUE IF NOT EXISTS 'bank_failure_sale_stands';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "bank_failure_at" TIMESTAMP(3),
ADD COLUMN     "refunded_amount_cents" INTEGER,
ADD COLUMN     "stripe_fee_cents" INTEGER;

