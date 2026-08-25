import type { StudyGuideConcept } from "@/app/_components/Course/components/Lesson/ConceptList/types";
import type { StudyGuideTerm } from "@/app/_components/Course/components/Lesson/GlossaryList/types";

export type StudyGuideResultsProps = {
	summary: string;
	concepts: StudyGuideConcept[];
	glossary: StudyGuideTerm[];
};
