-- CreateTable
CREATE TABLE "lesson_insights" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "concepts" JSONB NOT NULL,
    "glossary" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_insights_lessonId_key" ON "lesson_insights"("lessonId");

-- CreateIndex
CREATE INDEX "lesson_insights_lessonId_idx" ON "lesson_insights"("lessonId");

-- AddForeignKey
ALTER TABLE "lesson_insights" ADD CONSTRAINT "lesson_insights_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
