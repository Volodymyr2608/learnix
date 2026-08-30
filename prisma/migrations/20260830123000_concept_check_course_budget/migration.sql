-- The check budget is read at the grain evidence is written at.
--
-- `ConceptMastery` is unique on (studentId, courseId, conceptKey): two courses
-- that both teach "Closures" record it twice, deliberately. The budget deciding
-- whether a check may be issued was counted on (studentId, conceptKey) alone,
-- so a student who spent three attempts in one course could never earn the
-- concept in another, and a wrong answer in one silenced the other for a day.
--
-- The (studentId, conceptKey, questionKey) index stays as it is: a question is
-- asked once ACROSS courses, because the disclosure that makes a repeat unfair
-- — being told the answer you got wrong — is not scoped to a course.

CREATE INDEX "concept_checks_studentId_courseId_conceptKey_idx"
  ON "concept_checks" ("studentId", "courseId", "conceptKey");

DROP INDEX "concept_checks_studentId_conceptKey_idx";
