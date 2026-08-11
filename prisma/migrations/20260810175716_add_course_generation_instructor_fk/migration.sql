-- AddForeignKey
ALTER TABLE "course_generations" ADD CONSTRAINT "course_generations_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
