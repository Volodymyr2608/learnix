import type {
	FailedQuizRow,
	PathState,
	WeakConceptRow,
} from "../learningPathAI.state";

export function identifyWeakSignals(state: PathState): Partial<PathState> {
	const weakConcepts: WeakConceptRow[] = state.mastery
		.filter((m) => m.level < 3)
		.map((m) => ({
			concept: m.concept,
			level: m.level,
			firstLessonId:
				state.lessonOrder.find((l) => l.concepts.includes(m.concept))?.id ?? "",
		}))
		.filter((w) => w.firstLessonId !== "");

	const seenLessonIds = new Set<string>();
	const failedQuizzes: FailedQuizRow[] = state.quizAttempts
		.filter((a) => !a.isCorrect && !seenLessonIds.has(a.lessonId))
		.map((a) => {
			seenLessonIds.add(a.lessonId);
			return { lessonId: a.lessonId, quizId: a.quizId };
		});

	return { weakConcepts, failedQuizzes };
}
