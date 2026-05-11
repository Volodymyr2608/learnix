CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "CourseEmbedding" (
    "courseId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEmbedding_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "LessonChunkEmbedding" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "tokens" INTEGER NOT NULL,

    CONSTRAINT "LessonChunkEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterestEmbedding" (
    "userId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInterestEmbedding_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonChunkEmbedding_lessonId_chunkIndex_key" ON "LessonChunkEmbedding"("lessonId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "CourseEmbedding" ADD CONSTRAINT "CourseEmbedding_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonChunkEmbedding" ADD CONSTRAINT "LessonChunkEmbedding_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterestEmbedding" ADD CONSTRAINT "UserInterestEmbedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX course_embedding_cosine_idx
  ON "CourseEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX lesson_chunk_embedding_cosine_idx
  ON "LessonChunkEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX user_interest_embedding_cosine_idx
  ON "UserInterestEmbedding" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
