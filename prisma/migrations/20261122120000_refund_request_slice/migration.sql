-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('too_easy', 'too_hard', 'thin_content', 'other');

-- CreateEnum
CREATE TYPE "RefundDecision" AS ENUM ('auto_approved', 'auto_denied');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "paid_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "opened_lessons" (
    "student_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opened_lessons_pkey" PRIMARY KEY ("student_id","lesson_id")
);

-- CreateTable
CREATE TABLE "refund_requests" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "text" VARCHAR(2000),
    "decision" "RefundDecision" NOT NULL,
    "failed_conditions" TEXT[],
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refund_requests_payment_id_key" ON "refund_requests"("payment_id");

-- CreateIndex
CREATE INDEX "refund_requests_student_id_decision_created_at_idx" ON "refund_requests"("student_id", "decision", "created_at");

-- CreateIndex
CREATE INDEX "refund_requests_student_id_course_id_decision_idx" ON "refund_requests"("student_id", "course_id", "decision");

-- AddForeignKey
ALTER TABLE "opened_lessons" ADD CONSTRAINT "opened_lessons_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opened_lessons" ADD CONSTRAINT "opened_lessons_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

