import type { GuardDomain } from "@/server/services/_shared/aiGuard/types";

/**
 * How many of a lesson's concept names the relevance classifier is told about.
 *
 * A bound, not a tuning constant. Each name is interpolated into an untrusted
 * region of a prompt that runs before the first token of every tutor turn, and
 * `lessonInsights.concepts` is an LLM extraction with a loose upper bound — a
 * lesson that produced forty concepts would otherwise be paid for on every turn
 * and widen the injection surface by the same amount.
 *
 * Twenty is well past what a lesson teaches in practice (the seven-concept
 * lesson that surfaced this defect is typical) and far short of what an
 * over-eager extraction can emit.
 *
 * Exported so the test pins the bound rather than restating the number.
 */
export const MAX_DOMAIN_CONCEPTS = 20;

type LessonScope = {
	courseTitle: string;
	lessonTitle: string;
	/** Canonical names, from `lessonConceptNames`. Empty when insights have not generated. */
	concepts: string[];
};

/**
 * What the relevance classifier is told counts as on-topic for a tutor turn.
 *
 * The concept names are here because leaving them out made the concept-check
 * mechanism unreachable by its own natural phrasing. The tutor's prompt asks the
 * model to issue a check when the student's message claims they understand a
 * concept, and a student does that by NAMING the concept — while L2, told only
 * the course and lesson titles, judged those names to be a different subject.
 * Measured 2026-08-30: "Can you check my understanding of Optimization and SEO
 * Features?" refused 5/5 on a lesson titled "Overview of Next.js".
 *
 * `description` widens; `subject` does not. Only the first reaches the
 * classifier. The second builds the student-facing refusal, where a concept list
 * would be noise and would disclose the lesson's structure to someone who has
 * just been told they are off-topic.
 *
 * Nothing here decides trust: `topicRelevance.ts` wraps this string as
 * `course_data` like every other untrusted region, and concept names come from
 * an LLM extraction of the same instructor-authored body the titles come from —
 * the same channel, and so the same treatment.
 */
export const lessonGuardDomain = ({
	courseTitle,
	lessonTitle,
	concepts,
}: LessonScope): GuardDomain => {
	const scope = `the course "${courseTitle}" and its lesson "${lessonTitle}"`;
	const named = concepts.slice(0, MAX_DOMAIN_CONCEPTS);

	return {
		// A lesson whose insights have not generated yet produces exactly the
		// string this surface produced before concepts existed — no trailing
		// separator, no empty clause for the classifier to interpret.
		description:
			named.length === 0
				? scope
				: `${scope}, which covers these concepts: ${named.join(", ")}`,
		subject: `the "${courseTitle}" course`,
	};
};
