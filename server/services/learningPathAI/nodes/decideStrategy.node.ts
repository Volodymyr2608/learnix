import type { PathState } from "../learningPathAI.state";

export type StrategyBranch = "hasWeak" | "ready" | "empty";

export function decideStrategy(state: PathState): StrategyBranch {
	if (
		state.completedLessonIds.length === 0 &&
		state.quizAttempts.length === 0
	) {
		return "empty";
	}
	if (state.weakConcepts.length > 0 || state.failedQuizzes.length > 0) {
		return "hasWeak";
	}
	return "ready";
}

export function setSkipLLMIfEmpty(state: PathState): Partial<PathState> {
	if (
		state.completedLessonIds.length === 0 &&
		state.quizAttempts.length === 0
	) {
		return { skipLLM: true };
	}
	return {};
}
