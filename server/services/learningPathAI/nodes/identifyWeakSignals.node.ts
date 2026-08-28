import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import type {
	FailedQuizRow,
	PathState,
	WeakConceptRow,
} from "../learningPathAI.state";

/**
 * Purpose: derives the weak concepts (mastery below 3) and the deduplicated failed quizzes.
 * Reads: completedLessonIds, mastery, lessonOrder, quizAttempts.
 * Writes: weakConcepts, failedQuizzes.
 * Fails: cannot fail — pure computation over already-loaded signal.
 */
export function identifyWeakSignals(state: PathState): Partial<PathState> {
	const completedSet = new Set(state.completedLessonIds);

	// Keyed once per lesson rather than compared per mastery row, and through the
	// shared rule rather than `Array.includes`. `.includes()` is case- and
	// whitespace-sensitive where the writer of these rows compares case-
	// insensitively, so a row the tutor legitimately wrote could fail to match
	// here — and a non-match reads as "nothing to review", not as an error.
	const completedLessons = state.lessonOrder
		.filter((lesson) => completedSet.has(lesson.id))
		.map((lesson) => ({
			id: lesson.id,
			conceptKeys: new Set(lesson.concepts.map(conceptKey)),
		}));

	const weakConcepts: WeakConceptRow[] = state.mastery
		.filter((m) => m.level < 3)
		.map((m) => {
			const key = conceptKey(m.concept);
			return {
				concept: m.concept,
				level: m.level,
				firstLessonId:
					completedLessons.find((lesson) => lesson.conceptKeys.has(key))?.id ??
					"",
			};
		})
		.filter((w) => w.firstLessonId !== "");

	// Accumulated in one pass: `.filter()` runs to completion before `.map()`
	// begins, so a `seen` set populated in the map is still empty for every
	// filter call and deduplicates nothing.
	const seenLessonIds = new Set<string>();
	const failedQuizzes: FailedQuizRow[] = [];
	for (const attempt of state.quizAttempts) {
		if (attempt.isCorrect || seenLessonIds.has(attempt.lessonId)) continue;
		seenLessonIds.add(attempt.lessonId);
		failedQuizzes.push({ lessonId: attempt.lessonId, quizId: attempt.quizId });
	}

	return { weakConcepts, failedQuizzes };
}
