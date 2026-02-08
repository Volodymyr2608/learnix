/*
  Warnings:

  - You are about to drop the column `chatHistory` on the `course_generations` table. All the data in the column will be lost.
  - You are about to drop the column `topic` on the `course_generations` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CourseGenerationStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('system', 'user', 'assistant');

-- DropIndex
DROP INDEX "course_generations_instructor_id_idx";

-- AlterTable
ALTER TABLE "course_generations" DROP COLUMN "chatHistory",
DROP COLUMN "topic",
ADD COLUMN     "status" "CourseGenerationStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "course_generation_messages" (
    "id" TEXT NOT NULL,
    "generation_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "step" "DraftStep",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_generation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_generation_messages_generation_id_created_at_idx" ON "course_generation_messages"("generation_id", "created_at");

-- CreateIndex
CREATE INDEX "course_generations_instructor_id_status_idx" ON "course_generations"("instructor_id", "status");

-- AddForeignKey
ALTER TABLE "course_generation_messages" ADD CONSTRAINT "course_generation_messages_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "course_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
