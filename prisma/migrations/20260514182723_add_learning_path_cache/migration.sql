-- CreateTable
CREATE TABLE "learning_path_cache" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "weakConcepts" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAt" TIMESTAMP(3),

    CONSTRAINT "learning_path_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "learning_path_cache_studentId_courseId_key" ON "learning_path_cache"("studentId", "courseId");

-- AddForeignKey
ALTER TABLE "learning_path_cache" ADD CONSTRAINT "learning_path_cache_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_path_cache" ADD CONSTRAINT "learning_path_cache_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
