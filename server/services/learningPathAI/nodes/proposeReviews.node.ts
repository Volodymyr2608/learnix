import type { DraftStep, PathState } from "../learningPathAI.state";

/**
 * One phrasing per evidence value, as a lookup rather than a branch, so adding
 * a third kind of evidence fails to compile here instead of silently falling
 * through to whichever wording came last.
 */
const REVIEW_REASON: Record<
	PathState["weakConcepts"][number]["evidence"],
	(concept: string) => string
> = {
	encountered: (concept) =>
		`"${concept}" appeared in a lesson you completed but has not been checked yet — review recommended`,
	applied: (concept) =>
		`"${concept}" was answered correctly once but has not been confirmed by the lesson's quizzes — review recommended`,
};

/** One per lesson, and never more than the path has room to explain. */
const MAX_REVIEW_STEPS = 3;

/**
 * Purpose: proposes up to 3 REVIEW_LESSON and 2 RETRY_QUIZ candidate steps from the weak signal.
 * Reads: weakConcepts (until three distinct lessons are covered), failedQuizzes (first 2).
 * Writes: candidateSteps.
 * Fails: cannot fail.
 */
export function proposeReviews(state: PathState): Partial<PathState> {
	const seenLessonIds = new Set<string>();

	const reviewSteps: DraftStep[] = [];
	// Walk the whole list, deduplicating as we go, and stop at three STEPS.
	// Slicing to three CONCEPTS first and deduplicating after collapses the
	// output: `weakConcepts` is derived lesson by lesson, so the first three
	// entries share a lesson for any student whose first completed lesson has
	// three concepts, and the student gets one review however much they have
	// left to revisit.
	for (const w of state.weakConcepts) {
		if (reviewSteps.length === MAX_REVIEW_STEPS) break;
		// An orphaned concept — one whose lesson was reworded out from under its
		// row — has nowhere to send the student. A step with an empty lessonId
		// would render as a link to nothing.
		if (w.firstLessonId === "") continue;
		if (seenLessonIds.has(w.firstLessonId)) continue;
		seenLessonIds.add(w.firstLessonId);
		reviewSteps.push({
			type: "REVIEW_LESSON" as const,
			lessonId: w.firstLessonId,
			// A label, never a number. "2/3" is an internal scale that means nothing
			// to a student, and it was also a lie about what the row recorded — a
			// level 1 said "a lesson mentioned this", not "you are one third of the
			// way to mastery". The seed is interpolated into mergeAndExplain's
			// prompt and surfaces in the path's reason text, so it has to be true
			// for both readers.
			reasonSeed: REVIEW_REASON[w.evidence](w.concept),
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
