"use client";

import { useState } from "react";
import { api } from "@/trpc/client";
import {
	type GradedCheck,
	type HeldCheck,
	heldForTurn,
	type Selection,
	selectionFor,
	verdictFor,
	visibleCheck,
} from "../components/ConceptCheckPanel/utils";

/**
 * The open check for this lesson, the one way to answer it, and every rule about
 * how long the panel's state survives.
 *
 * The mutation submits a POSITION in the option order the server sent, never the
 * option text and never a concept or a level. Everything recorded is read
 * server-side from the row the claim returns, so there is nothing here a client
 * could tamper with to change what gets written.
 *
 * Three things are held past the request that produced them, and each is stored
 * next to what bounds it rather than on its own:
 *
 *   * the **answered check**, with the turn it was answered in. It has to be
 *     held at all because `pendingCheck` returns PENDING rows only, so its
 *     answer goes null the instant a grade lands and the panel would unmount in
 *     the same tick as the verdict. It stops being held when the student sends
 *     the next message.
 *   * the **verdict**, with the id of the check it graded, so it is never shown
 *     under a later question.
 *   * the **selection**, with the same id, so a stale option cannot sit selected
 *     against a question that never offered it.
 *
 * All three are read back through the pure rules in the panel's `utils.ts`,
 * which is what makes "the panel does not hang" a unit test rather than a claim.
 */
export const useConceptCheck = (lessonId: string, turn: number) => {
	const utils = api.useUtils();
	const { data: pending, isLoading } =
		api.lessonAssistant.pendingCheck.useQuery({ lessonId });

	const [held, setHeld] = useState<HeldCheck | null>(null);
	const [graded, setGraded] = useState<GradedCheck | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);

	const answer = api.lessonAssistant.answerConceptCheck.useMutation({
		onSuccess: (result, variables) =>
			setGraded({ checkId: variables.checkId, result }),
		onSettled: () =>
			utils.lessonAssistant.pendingCheck.setData({ lessonId }, null),
	});

	const check = visibleCheck(pending ?? null, heldForTurn(held, turn));

	const submit = (input: { checkId: string; optionIndex: number }) => {
		// Held before the mutation resolves, so the question stays on screen with
		// its result rather than vanishing underneath it — for this turn, and not
		// for the rest of the session.
		if (pending) setHeld({ check: pending, turn });
		answer.mutate(input);
	};

	return {
		check,
		isLoading,
		selected: selectionFor(check, selection),
		select: (option: string) =>
			check && setSelection({ checkId: check.id, option }),
		submit,
		isSubmitting: answer.isPending,
		result: verdictFor(check, graded),
	};
};
