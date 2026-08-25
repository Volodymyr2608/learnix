import type { Concept } from "@/app/_components/Course/components/Lesson/ConceptList/types";
import type { GlossaryItem } from "@/app/_components/Course/components/Lesson/GlossaryList/types";

export type StudyGuideResultsProps = {
	summary: string;
	concepts: Concept[];
	glossary: GlossaryItem[];
};
