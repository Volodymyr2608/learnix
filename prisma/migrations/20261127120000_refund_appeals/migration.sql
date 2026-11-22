-- Refund slice 8 (appeals, evidence, audit, needs review). Generated with prisma migrate diff; the
-- backfill and the trigger at the end are hand-written (plan-slice-8 Task 1).

-- CreateEnum
CREATE TYPE "RefundApproval" AS ENUM ('automatic', 'appeal', 'overdue');

-- CreateEnum
CREATE TYPE "AppealKind" AS ENUM ('direct', 'after_denial');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('open', 'approved', 'denied', 'overdue_approved');

-- CreateEnum
CREATE TYPE "EvidenceUploader" AS ENUM ('student', 'admin');

-- CreateEnum
CREATE TYPE "RefundAuditKind" AS ENUM ('appeal_approved', 'appeal_denied', 'appeal_overdue', 'exception');

-- AlterEnum
ALTER TYPE "RefundDecision" ADD VALUE 'direct_appeal';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "needs_review_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refund_requests" ADD COLUMN     "approval" "RefundApproval";

-- CreateTable
CREATE TABLE "refund_appeals" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "kind" "AppealKind" NOT NULL,
    "exceeded_condition" TEXT NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'open',
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "denial_reason" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_evidence_files" (
    "id" TEXT NOT NULL,
    "appeal_id" TEXT NOT NULL,
    "uploaded_by" "EvidenceUploader" NOT NULL,
    "blob_pathname" TEXT NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "refund_evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_audit" (
    "id" TEXT NOT NULL,
    "kind" "RefundAuditKind" NOT NULL,
    "payment_id" TEXT NOT NULL,
    "appeal_id" TEXT,
    "admin_id" TEXT,
    "reason" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_appeals_request_id_key" ON "refund_appeals"("request_id");

-- CreateIndex
CREATE INDEX "refund_appeals_status_created_at_idx" ON "refund_appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "refund_evidence_files_appeal_id_idx" ON "refund_evidence_files"("appeal_id");

-- CreateIndex
CREATE INDEX "refund_audit_payment_id_idx" ON "refund_audit"("payment_id");

-- AddForeignKey
ALTER TABLE "refund_appeals" ADD CONSTRAINT "refund_appeals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "refund_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_evidence_files" ADD CONSTRAINT "refund_evidence_files_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "refund_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_audit" ADD CONSTRAINT "refund_audit_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_audit" ADD CONSTRAINT "refund_audit_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "refund_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- V2: every refund approved so far was an automatic one.
UPDATE "refund_requests" SET "approval" = 'automatic' WHERE "decision" = 'auto_approved';

-- V4 / C18: the audit is append-only. TRUNCATE (tests only) does not fire row triggers.
CREATE FUNCTION refund_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refund_audit is append-only (C18)';
END $$;

CREATE TRIGGER refund_audit_no_change BEFORE UPDATE OR DELETE ON "refund_audit"
  FOR EACH ROW EXECUTE FUNCTION refund_audit_append_only();
