-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('none', 'pending', 'transferred', 'reversed');

-- AlterTable: add new cents columns
ALTER TABLE "courses" ADD COLUMN     "original_price_cents" INTEGER,
ADD COLUMN     "price_cents" INTEGER NOT NULL DEFAULT 0;

-- Backfill: convert string price fields to integer cents
UPDATE "courses" SET "price_cents" = ROUND(CAST(NULLIF("price", '') AS DECIMAL) * 100);
UPDATE "courses" SET "original_price_cents" = ROUND(CAST("original_price" AS DECIMAL) * 100)
  WHERE "original_price" IS NOT NULL AND "original_price" != '';

-- Drop old string price columns
ALTER TABLE "courses" DROP COLUMN "price";
ALTER TABLE "courses" DROP COLUMN "original_price";

-- AlterTable: add Stripe Connect fields to instructor_profiles
ALTER TABLE "instructor_profiles" ADD COLUMN     "stripe_account_id" TEXT,
ADD COLUMN     "stripe_charges_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripe_onboarded_at" TIMESTAMP(3),
ADD COLUMN     "stripe_payouts_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "platform_fee_cents" INTEGER,
    "instructor_net_cents" INTEGER,
    "transfer_status" "TransferStatus" NOT NULL DEFAULT 'none',
    "stripe_transfer_id" TEXT,
    "transferred_at" TIMESTAMP(3),
    "stripe_checkout_session_id" TEXT,
    "stripe_payment_intent_id" TEXT,
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_transfer_id_key" ON "payments"("stripe_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_checkout_session_id_key" ON "payments"("stripe_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "payments_instructorId_idx" ON "payments"("instructorId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE INDEX "payments_courseId_idx" ON "payments"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_profiles_stripe_account_id_key" ON "instructor_profiles"("stripe_account_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;