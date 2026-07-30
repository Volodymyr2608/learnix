import type { PathState } from "../learningPathAI.state";

export type StrategyBranch = "hasWeak" | "ready" | "empty";

/**
 * Purpose: picks the proposal strategy — review weak areas, propose new lessons, or skip the model
 * entirely for a student with no history. This is a route predicate, never registered via addNode.
 * Reads: completedLessonIds, quizAttempts, weakConcepts, failedQuizzes.
 * Writes: nothing.
 * Fails: cannot fail.
 */
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

/**
 * Purpose: marks a no-history student so mergeAndExplain builds the path deterministically instead
 * of paying for a model call that has nothing to reason about.
 * Reads: completedLessonIds, quizAttempts.
 * Writes: skipLLM.
 * Fails: cannot fail.
 */
export function setSkipLLMIfEmpty(state: PathState): Partial<PathState> {
	if (
		state.completedLessonIds.length === 0 &&
		state.quizAttempts.length === 0
	) {
		return { skipLLM: true };
	}
	return {};
}
