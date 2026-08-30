-- The concept check: a tutor-authored multiple-choice question about one lesson
-- concept, so that mastery in conversation is earned by answering a
-- server-graded question rather than by the model asserting understanding.

-- CreateEnum
CREATE TYPE "ConceptCheckStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');

-- CreateTable
CREATE TABLE "concept_checks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correct" TEXT NOT NULL,
    "status" "ConceptCheckStatus" NOT NULL DEFAULT 'PENDING',
    "selectedAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concept_checks_studentId_conceptKey_idx" ON "concept_checks"("studentId", "conceptKey");

-- AddForeignKey
ALTER TABLE "concept_checks" ADD CONSTRAINT "concept_checks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_checks" ADD CONSTRAINT "concept_checks_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_checks" ADD CONSTRAINT "concept_checks_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One open check per (student, lesson), enforced by the database rather than by
-- a read-then-write in the service.
--
-- Prisma has no syntax for a partial index, so this object exists ONLY in this
-- file: `prisma db push` would remove it, and `prisma migrate dev` reports it as
-- drift. See the INVARIANT block at the foot of
-- `prisma/schema/conceptCheck.prisma`.
--
-- The predicate is `status = 'PENDING'` and nothing else. `expiresAt > now()`
-- cannot join it — index predicates must be IMMUTABLE — so an unswept expired
-- row would otherwise hold the lesson's only slot forever. Issuing expires stale
-- rows in the same transaction as the insert instead.
CREATE UNIQUE INDEX "concept_checks_one_pending_per_lesson"
    ON "concept_checks" ("studentId", "lessonId")
    WHERE (status = 'PENDING');
