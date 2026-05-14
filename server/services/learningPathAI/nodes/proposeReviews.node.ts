import type { DraftStep, PathState } from "../learningPathAI.state";

export function proposeReviews(state: PathState): Partial<PathState> {
	const reviewSteps: DraftStep[] = state.weakConcepts.slice(0, 3).map((w) => ({
		type: "REVIEW_LESSON" as const,
		lessonId: w.firstLessonId,
		reasonSeed: `Mastery of "${w.concept}" is ${w.level}/5 — review recommended`,
	}));

	const retrySteps: DraftStep[] = state.failedQuizzes.slice(0, 2).map((f) => ({
		type: "RETRY_QUIZ" as const,
		lessonId: f.lessonId,
		quizId: f.quizId,
		reasonSeed: "Previous quiz attempt was incorrect",
	}));

	return { candidateSteps: [...reviewSteps, ...retrySteps] };
}