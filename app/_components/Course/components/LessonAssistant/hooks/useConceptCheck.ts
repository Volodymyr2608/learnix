"use client";

import { api } from "@/trpc/client";

/**
 * The open check for this lesson, and the one way to answer it.
 *
 * The mutation submits a POSITION in the option order the server sent, never the
 * option text and never a concept or a level. Everything recorded is read
 * server-side from the row the claim returns, so there is nothing here a client
 * could tamper with to change what gets written.
 */
export const useConceptCheck = (lessonId: string) => {
	const utils = api.useUtils();
	const { data: check, isLoading } = api.lessonAssistant.pendingCheck.useQuery({
		lessonId,
	});

	const answer = api.lessonAssistant.answerConceptCheck.useMutation({
		onSettled: () =>
			utils.lessonAssistant.pendingCheck.invalidate({ lessonId }),
	});

	return {
		check: check ?? null,
		isLoading,
		submit: answer.mutate,
		isSubmitting: answer.isPending,
		result: answer.data ?? null,
	};
};
