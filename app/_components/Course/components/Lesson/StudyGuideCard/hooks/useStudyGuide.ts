import { parseGlossary } from "@/lib/parse/parseGlossary";
import { api } from "@/trpc/client";

export const useStudyGuide = (lessonId: string) => {
	const { data: insights } =
		api.lessonInsightsAI.getLessonInsights.useQuery(lessonId);

	if (!insights) return null;

	return {
		summary: insights.summary,
		// `concepts` is already parsed by the repository read boundary;
		// `glossary` is not, so it gets parsed here rather than cast.
		concepts: insights.concepts,
		glossary: parseGlossary(insights.glossary),
	};
};
