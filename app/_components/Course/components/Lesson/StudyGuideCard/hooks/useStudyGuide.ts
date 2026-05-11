import { api } from "@/trpc/client";
import type { Concept, GlossaryItem } from "../types";

export const useStudyGuide = (lessonId: string) => {
	const { data: insights } =
		api.lessonInsightsAI.getLessonInsights.useQuery(lessonId);

	if (!insights) return null;

	return {
		summary: insights.summary,
		concepts: insights.concepts as Concept[],
		glossary: insights.glossary as GlossaryItem[],
	};
};
