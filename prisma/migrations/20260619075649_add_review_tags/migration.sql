-- CreateEnum
CREATE TYPE "review_tag" AS ENUM ('COURSE_CONTENT', 'INSTRUCTOR', 'PRACTICAL_EXAMPLES', 'PACE', 'RESOURCES', 'EXERCISES');

-- AlterTable
ALTER TABLE "course_reviews" ADD COLUMN     "tags" "review_tag"[] DEFAULT ARRAY[]::"review_tag"[];
