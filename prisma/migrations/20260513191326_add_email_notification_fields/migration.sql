-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "welcome_email_sent_at" TIMESTAMP(3);
