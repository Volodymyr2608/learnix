-- CreateEnum
CREATE TYPE "DraftStep" AS ENUM ('basic', 'objectives', 'requirements', 'curriculum');

-- CreateTable
CREATE TABLE "course_generations" (
    "id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "topic" TEXT,
    "step" "DraftStep" NOT NULL DEFAULT 'basic',
    "content" JSONB NOT NULL DEFAULT '{}',
    "chatHistory" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_generations_instructor_id_idx" ON "course_generations"("instructor_id");
