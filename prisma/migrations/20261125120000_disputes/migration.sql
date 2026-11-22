
-- CreateEnum
CREATE TYPE "DisputeState" AS ENUM ('open', 'won', 'lost');

-- CreateEnum
CREATE TYPE "RefundSource" AS ENUM ('refund_request', 'dashboard_refund', 'admin_exception', 'lost_dispute');

-- AlterEnum
ALTER TYPE "RefundState" ADD VALUE 'refunded_by_bank';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "dispute_state" "DisputeState",
ADD COLUMN     "dispute_updated_at" INTEGER,
ADD COLUMN     "refund_source" "RefundSource";

