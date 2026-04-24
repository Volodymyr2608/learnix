-- AlterTable
ALTER TABLE "courses"
ADD COLUMN "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "reviews_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "course_reviews" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "course_reviews_pkey" PRIMARY KEY ("id")
);

-- AddConstraint
ALTER TABLE "course_reviews"
ADD CONSTRAINT "course_reviews_rating_check"
CHECK ("rating" >= 1 AND "rating" <= 5);

-- CreateIndex
CREATE UNIQUE INDEX "course_reviews_courseId_studentId_key" ON "course_reviews"("courseId", "studentId");

-- CreateIndex
CREATE INDEX "course_reviews_courseId_idx" ON "course_reviews"("courseId");

-- CreateIndex
CREATE INDEX "course_reviews_studentId_idx" ON "course_reviews"("studentId");

-- CreateIndex
CREATE INDEX "course_reviews_deleted_at_idx" ON "course_reviews"("deleted_at");

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_reviews" ADD CONSTRAINT "course_reviews_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
