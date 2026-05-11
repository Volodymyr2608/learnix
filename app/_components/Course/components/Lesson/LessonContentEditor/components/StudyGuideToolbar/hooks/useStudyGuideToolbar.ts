import { toast } from "sonner";
import { api } from "@/trpc/client";

export const useStudyGuideToolbar = (
	lessonId: string,
	lastSavedAt: Date | null,
) => {
	const utils = api.useUtils();

	const { data: insights } =
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

	const conceptCount = Array.isArray(insights?.concepts)
		? insights.concepts.length
		: 0;
	const glossaryCount = Array.isArray(insights?.glossary)
		? insights.glossary.length
		: 0;

	return {
		insights,
		isStale,
		conceptCount,
		glossaryCount,
		isGenerating: generate.isPending,
		handleGenerate: () => generate.mutate(lessonId),
	};
};
