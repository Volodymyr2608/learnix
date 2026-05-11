-- DropIndex
DROP INDEX "course_embedding_cosine_idx";

-- DropIndex
DROP INDEX "lesson_chunk_embedding_cosine_idx";

-- DropIndex
DROP INDEX "user_interest_embedding_cosine_idx";

-- AlterTable
ALTER TABLE "course_embeddings" RENAME CONSTRAINT "CourseEmbedding_pkey" TO "course_embeddings_pkey";

-- AlterTable
ALTER TABLE "lesson_chunk_embeddings" RENAME CONSTRAINT "LessonChunkEmbedding_pkey" TO "lesson_chunk_embeddings_pkey";

-- AlterTable
ALTER TABLE "user_interest_embeddings" RENAME CONSTRAINT "UserInterestEmbedding_pkey" TO "user_interest_embeddings_pkey";

-- CreateTable
CREATE TABLE "lesson_assistant_conversations" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_assistant_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_mastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_assistant_conversations_lessonId_studentId_key" ON "lesson_assistant_conversations"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "concept_mastery_studentId_courseId_idx" ON "concept_mastery"("studentId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "concept_mastery_studentId_courseId_concept_key" ON "concept_mastery"("studentId", "courseId", "concept");

-- RenameForeignKey
ALTER TABLE "course_embeddings" RENAME CONSTRAINT "CourseEmbedding_courseId_fkey" TO "course_embeddings_courseId_fkey";

-- RenameForeignKey
ALTER TABLE "lesson_chunk_embeddings" RENAME CONSTRAINT "LessonChunkEmbedding_lessonId_fkey" TO "lesson_chunk_embeddings_lessonId_fkey";

-- RenameForeignKey
ALTER TABLE "user_interest_embeddings" RENAME CONSTRAINT "UserInterestEmbedding_userId_fkey" TO "user_interest_embeddings_userId_fkey";

-- AddForeignKey
ALTER TABLE "lesson_assistant_conversations" ADD CONSTRAINT "lesson_assistant_conversations_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assistant_conversations" ADD CONSTRAINT "lesson_assistant_conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_assistant_messages" ADD CONSTRAINT "lesson_assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "lesson_assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_mastery" ADD CONSTRAINT "concept_mastery_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "LessonChunkEmbedding_lessonId_chunkIndex_key" RENAME TO "lesson_chunk_embeddings_lessonId_chunkIndex_key";
