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

	/**
	 * Two signals, because neither covers the other.
	 *
	 * `matchesCurrentContent` is the server comparing the stored hash to the
	 * lesson text as it is in the database — authoritative, and the only one that
	 * knows about an edit made in a previous session.
	 *
	 * `lastSavedAt` covers the window the server signal cannot: right after a save
	 * this query has not been refetched, so its flag still describes the content
	 * from before the save.
	 */
	const savedSinceGenerated =
		insights != null &&
		lastSavedAt !== null &&
		new Date(insights.generatedAt) < lastSavedAt;

	const isStale =
		insights != null &&
		(savedSinceGenerated || !insights.matchesCurrentContent);

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
		// A guide that matches the current content cannot be regenerated: the
		// service short-circuits on the hash and returns the stored row without
		// calling the model. The button reported success for work it never did, so
		// it is disabled rather than left to lie.
		canRegenerate: !insights || isStale,
		isGenerating: generate.isPending,
		handleGenerate: () => generate.mutate(lessonId),
	};
};
