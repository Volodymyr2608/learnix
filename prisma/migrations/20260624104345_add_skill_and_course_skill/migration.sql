-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_skills" (
    "courseId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "course_skills_pkey" PRIMARY KEY ("courseId","skillId")
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "course_skills_skillId_idx" ON "course_skills"("skillId");

-- AddForeignKey
ALTER TABLE "course_skills" ADD CONSTRAINT "course_skills_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_skills" ADD CONSTRAINT "course_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
