import type { DraftStep, PathState } from "../learningPathAI.state";

/**
 * Purpose: proposes up to 3 REVIEW_LESSON and 2 RETRY_QUIZ candidate steps from the weak signal.
 * Reads: weakConcepts (first 3), failedQuizzes (first 2).
 * Writes: candidateSteps.
 * Fails: cannot fail.
 */
export function proposeReviews(state: PathState): Partial<PathState> {
	const seenLessonIds = new Set<string>();

	const reviewSteps: DraftStep[] = [];
	for (const w of state.weakConcepts.slice(0, 3)) {
		if (seenLessonIds.has(w.firstLessonId)) continue;
		seenLessonIds.add(w.firstLessonId);
		reviewSteps.push({
			type: "REVIEW_LESSON" as const,
			lessonId: w.firstLessonId,
			reasonSeed: `Mastery of "${w.concept}" is ${w.level}/5 — review recommended`,
		});
	}

	const retrySteps: DraftStep[] = [];
	for (const f of state.failedQuizzes.slice(0, 2)) {
		if (seenLessonIds.has(f.lessonId)) continue;
		seenLessonIds.add(f.lessonId);
		retrySteps.push({
			type: "RETRY_QUIZ" as const,
			lessonId: f.lessonId,
			quizId: f.quizId,
			reasonSeed: "Previous quiz attempt was incorrect",
		});
	}

	return { candidateSteps: [...reviewSteps, ...retrySteps] };
}
