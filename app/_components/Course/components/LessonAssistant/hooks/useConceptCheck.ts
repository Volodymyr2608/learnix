"use client";

import { useState } from "react";
import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import { api } from "@/trpc/client";
import { visibleCheck } from "../components/ConceptCheckPanel/utils";

/**
 * The open check for this lesson, and the one way to answer it.
 *
 * The mutation submits a POSITION in the option order the server sent, never the
 * option text and never a concept or a level. Everything recorded is read
 * server-side from the row the claim returns, so there is nothing here a client
 * could tamper with to change what gets written.
 *
 * The answered check is held locally for one reason: `pendingCheck` returns only
 * PENDING rows, so the moment an answer lands the query's answer is null.
 * Dropping the check then would unmount the panel in the same tick the result
 * arrives, and the student would never see whether they were right. A new check
 * takes precedence over the held one, so the panel follows the tutor rather than
 * the last thing that happened.
 */
export const useConceptCheck = (lessonId: string) => {
	const utils = api.useUtils();
	const { data: pending, isLoading } =
		api.lessonAssistant.pendingCheck.useQuery({ lessonId });
	const [answered, setAnswered] = useState<ConceptCheckPublic | null>(null);

	const answer = api.lessonAssistant.answerConceptCheck.useMutation({
		onSettled: () =>
			utils.lessonAssistant.pendingCheck.setData({ lessonId }, null),
	});

	const submit = (input: { checkId: string; optionIndex: number }) => {
		// Held before the mutation resolves, so the question stays on screen with
		// its result rather than vanishing underneath it.
		setAnswered(pending ?? null);
		answer.mutate(input);
	};

	return {
		check: visibleCheck(pending ?? null, answered),
		isLoading,
		submit,
		isSubmitting: answer.isPending,
		result: answer.data ?? null,
	};
};
