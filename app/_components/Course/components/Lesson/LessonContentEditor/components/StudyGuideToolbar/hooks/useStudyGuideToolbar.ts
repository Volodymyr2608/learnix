import { toast } from "sonner";
import { parseGlossary } from "@/lib/parse/parseGlossary";
import { api } from "@/trpc/client";

export const useStudyGuideToolbar = (
	lessonId: string,
	lastSavedAt: Date | null,
) => {
	const utils = api.useUtils();

	const { data: insights, isPending: isLoading } =
		api.lessonInsightsAI.getLessonInsights.useQuery(lessonId);

	const generate = api.lessonInsightsAI.generateLessonInsights.useMutation({
		onSuccess: () => {
			toast.success("Study guide generated.");
			utils.lessonInsightsAI.getLessonInsights.invalidate(lessonId);
		},
		onError: (err) => {
			if (err.data?.code === "BAD_REQUEST") {
				toast.error("This lesson has no content to summarise.");
			} else {
				toast.error("Generation failed. Please try again.");
			}
		},
	});

	const isStale =
		insights !== null &&
		insights !== undefined &&
		lastSavedAt !== null &&
		new Date(insights.generatedAt) < lastSavedAt;

	// The arrays themselves, not counts of them: the view renders these and
	// derives its own headings from `.length`, so a count can never disagree with
	// the list beneath it.
	const concepts = insights?.concepts ?? [];
	const glossary = parseGlossary(insights?.glossary);

	return {
		insights,
		isLoading,
		isStale,
		concepts,
		glossary,
		isGenerating: generate.isPending,
		handleGenerate: () => generate.mutate(lessonId),
	};
};
