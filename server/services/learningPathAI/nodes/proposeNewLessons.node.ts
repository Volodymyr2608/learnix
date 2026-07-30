import type { DraftStep, PathState } from "../learningPathAI.state";

/**
 * Purpose: appends up to 3 next-in-sequence NEW_LESSON candidates the student has not completed.
 * Reads: completedLessonIds, candidateSteps, lessonOrder.
 * Writes: candidateSteps (appended, not replaced).
 * Fails: cannot fail.
 */
export function proposeNewLessons(state: PathState): Partial<PathState> {
	const completedSet = new Set(state.completedLessonIds);
	const existingCandidateSet = new Set(
		(state.candidateSteps ?? []).map((c) => c.lessonId),
	);
	const next: DraftStep[] = state.lessonOrder
		.filter((l) => !completedSet.has(l.id) && !existingCandidateSet.has(l.id))
		.sort(
			(a, b) =>
				a.sectionOrder - b.sectionOrder || a.lessonOrder - b.lessonOrder,
		)
		.slice(0, 3)
		.map((l) => ({
			type: "NEW_LESSON" as const,
			lessonId: l.id,
			reasonSeed: "Next lesson in sequence",
		}));

	return { candidateSteps: [...(state.candidateSteps ?? []), ...next] };
}
