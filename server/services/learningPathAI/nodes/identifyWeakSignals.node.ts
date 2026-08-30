import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import type {
	FailedQuizRow,
	PathState,
	WeakConceptRow,
} from "../learningPathAI.state";

/**
 * A ceiling on the derived list, because it is `JSON.stringify`'d into the merge
 * prompt and again into every reflection retry.
 *
 * While weak concepts came from persisted rows the list was small by
 * construction. Derived from completed lessons it is not: a 40-lesson course at
 * five concepts each is 200 objects per generation, a cost nobody chose. Two
 * dozen is more than `proposeReviews` can use (three lessons) and more than the
 * model's own output schema allows back (eight).
 */
export const MAX_WEAK_CONCEPTS = 24;

/**
 * Purpose: derives the weak concepts and the deduplicated failed quizzes.
 * Reads: completedLessonIds, mastery, lessonOrder, quizAttempts.
 * Writes: weakConcepts, failedQuizzes.
 * Fails: cannot fail — pure computation over already-loaded signal.
 *
 * The weak set is a UNION of two things, not a filter over one:
 *
 *   (concepts of completed lessons)  ∪  (concepts with a persisted row)
 *
 * The left side is what used to be stored as level 0/1 — "the student has seen
 * a lesson that mentions this" — and it is derived here instead, from data
 * `loadStudentSignal` already loads in the same `Promise.all`. Deriving it is
 * what made deleting those rows safe: a filter over persisted rows alone would
 * make every concept the student has merely encountered vanish from review
 * entirely, which is the opposite of the invariant the delete was justified by.
 *
 * A concept at level 3 is not weak and is dropped. An orphaned row — one whose
 * concept no longer appears in any lesson, because an insights regeneration
 * reworded it — survives with an empty `firstLessonId` and produces no review
 * step; it is retained rather than destroyed, because a model rewording a
 * heading must not erase evidence a student earned.
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
			concepts: lesson.concepts,
			conceptKeys: new Set(lesson.concepts.map(conceptKey)),
		}));

	const firstLessonFor = (key: string): string =>
		completedLessons.find((lesson) => lesson.conceptKeys.has(key))?.id ?? "";

	// Keyed, so the two sides of the union agree about what one concept is. The
	// persisted row wins on spelling and on evidence: it is the one that recorded
	// something the student did.
	const byKey = new Map<string, WeakConceptRow>();

	for (const lesson of completedLessons) {
		for (const concept of lesson.concepts) {
			const key = conceptKey(concept);
			if (key.length === 0 || byKey.has(key)) continue;
			byKey.set(key, {
				concept,
				evidence: "encountered",
				firstLessonId: lesson.id,
			});
		}
	}

	for (const m of state.mastery) {
		const key = conceptKey(m.concept);
		// Mastered by quiz: not weak, and it must also displace an `encountered`
		// entry the lesson scan just added, or the student is told to review what
		// they have demonstrably mastered.
		if (m.level >= 3) {
			byKey.delete(key);
			continue;
		}
		byKey.set(key, {
			concept: m.concept,
			evidence: "applied",
			firstLessonId: firstLessonFor(key),
		});
	}

	// Orphans are kept, with an empty `firstLessonId`. A row whose concept no
	// longer appears in any lesson is still evidence of something the student
	// did, and it is still weak — it just has no lesson to send them back to, so
	// `proposeReviews` skips it rather than emitting a step pointing at "".
	//
	// Ordered before it is capped, and `applied` first. The list is derived from
	// every concept of every completed lesson, so in course order the handful of
	// rows recording something the student actually DID would sit behind every
	// bare "encountered" entry — out of the prompt, out of the three reviews, out
	// of sight. Within each group the derivation order is kept, which is lesson
	// order.
	const all = [...byKey.values()];
	const weakConcepts: WeakConceptRow[] = [
		...all.filter((row) => row.evidence === "applied"),
		...all.filter((row) => row.evidence !== "applied"),
	].slice(0, MAX_WEAK_CONCEPTS);

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
