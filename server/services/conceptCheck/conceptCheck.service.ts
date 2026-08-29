import { randomInt } from "node:crypto";
import { EnrollmentStatus } from "@/generated/prisma";
import {
	type ConceptCheckPublic,
	conceptCheckRepository,
} from "@/server/repositories/conceptCheck.repository";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { conceptKey } from "@/server/services/_shared/concepts/conceptKey";
import { CONVERSATION_MAX_LEVEL } from "@/server/services/mastery/masteryLevels";
import {
	CheckAlreadyPendingError,
	CheckBudgetSpentError,
	CheckUnavailableError,
	ConceptCheckForbiddenError,
} from "./conceptCheck.errors";

/**
 * How long a model-authored answer key lives at rest. Long enough for the
 * student to answer the question they were just asked, short enough that an
 * abandoned conversation is not still holding one hours later.
 */
const CHECK_TTL_MINUTES = 30;

/**
 * Three per concept, ever. A student who cannot answer a fair question about a
 * concept in three tries has not demonstrated it, and a fourth attempt is
 * enumeration rather than learning.
 */
const MAX_CHECKS_PER_CONCEPT = 3;

/**
 * A wrong answer is not a permanent denial — the same reasoning as the quiz cap.
 * The next question must also be a different one, which is the authoring rule's
 * job, not this one's.
 */
const WRONG_ANSWER_COOLDOWN_HOURS = 24;

export type AnswerCheckInput = {
	studentId: string;
	checkId: string;
	/**
	 * A position in the stored, shuffled options — never the option text. The
	 * text that gets graded is read from the claimed row, so a client cannot
	 * submit an answer the question never offered.
	 */
	optionIndex: number;
};

export type AnswerCheckResult = {
	isCorrect: boolean;
	/**
	 * The one channel the answer key leaves the server through: the terminal
	 * response of a claim that succeeded, to the student who owns the row, once.
	 */
	correctOption: string;
};

export type IssueCheckInput = {
	studentId: string;
	lessonId: string;
	/** Already resolved through the lesson's allowlist by the caller. */
	concept: string;
	question: string;
	/** In the order the model authored them. Never persisted in that order. */
	options: string[];
	correctOption: string;
};

/**
 * A Fisher–Yates shuffle drawing from the CSPRNG, so the stored order is a
 * function of the server's randomness and not of anything the model chose.
 *
 * This is the cheapest control in the feature: "always make the correct option
 * A" becomes a no-op whether it arrives by injection through lesson content or
 * as the model's own positional bias. It lives here, at the write, rather than
 * at the caller — a second caller must not be able to skip it.
 */
const shuffled = (options: string[]): string[] => {
	const out = [...options];
	for (let i = out.length - 1; i > 0; i--) {
		const j = randomInt(i + 1);
		const a = out[i] as string;
		const b = out[j] as string;
		out[i] = b;
		out[j] = a;
	}
	return out;
};

class ConceptCheckService {
	/**
	 * Resolves the course the lesson belongs to, and only for a student whose
	 * enrollment is live. The query that authorizes is the query that acts
	 * (ADR-023): the `courseId` the check is written with comes back from the same
	 * statement that proved the student may have it, so there is no window in
	 * which the two disagree.
	 */
	private async authorizeLesson(
		lessonId: string,
		studentId: string,
	): Promise<{ courseId: string }> {
		const lesson = (await lessonRepository.findFirst({
			where: {
				id: lessonId,
				deletedAt: null,
				section: {
					course: {
						enrollments: {
							some: {
								studentId,
								status: { not: EnrollmentStatus.cancelled },
							},
						},
					},
				},
			},
			select: { section: { select: { courseId: true } } },
		})) as { section: { courseId: string } } | null;

		if (!lesson) {
			throw new ConceptCheckForbiddenError(
				"Access denied — not enrolled in this course",
				"FORBIDDEN",
			);
		}

		return { courseId: lesson.section.courseId };
	}

	/**
	 * Every bound on a check, all of them server-side counters rather than
	 * requests made of the model in a prompt.
	 */
	private async assertBudget(
		studentId: string,
		courseId: string,
		key: string,
	): Promise<void> {
		const [mastery, spent, lastWrongAt] = await Promise.all([
			conceptMasteryRepository.findFirst({
				where: { studentId, courseId, conceptKey: key },
				select: { level: true },
			}) as Promise<{ level: number } | null>,
			conceptCheckRepository.countForConcept(studentId, key),
			conceptCheckRepository.lastWrongAnsweredAt(studentId, key),
		]);

		// Evidence already earned is not re-earned. A concept at the conversation
		// ceiling has nothing a check could add, and asking again would let a
		// student spend attempts re-proving what the record already says.
		if (mastery && mastery.level >= CONVERSATION_MAX_LEVEL) {
			throw new CheckBudgetSpentError("No check is available for this concept");
		}

		if (spent >= MAX_CHECKS_PER_CONCEPT) {
			throw new CheckBudgetSpentError("No check is available for this concept");
		}

		const cooldownEnds = lastWrongAt
			? lastWrongAt.getTime() + WRONG_ANSWER_COOLDOWN_HOURS * 3_600_000
			: 0;
		if (cooldownEnds > Date.now()) {
			throw new CheckBudgetSpentError("No check is available for this concept");
		}
	}

	/**
	 * Writes the authored check and returns it as the student may see it.
	 *
	 * The sweep and the insert share one transaction on purpose. The partial
	 * unique index cannot carry `expiresAt` — index predicates must be immutable
	 * — so an abandoned `PENDING` row would otherwise hold this lesson's only slot
	 * forever. Sweeping in a separate statement would leave a window in which two
	 * concurrent issues both see a swept slot and one of them raises.
	 *
	 * A `P2002` from that index is not an error condition: it means the student
	 * already has a question waiting. It surfaces as `CheckAlreadyPendingError`,
	 * carrying no constraint name.
	 */
	async issue(input: IssueCheckInput): Promise<ConceptCheckPublic> {
		const { courseId } = await this.authorizeLesson(
			input.lessonId,
			input.studentId,
		);
		const key = conceptKey(input.concept);
		await this.assertBudget(input.studentId, courseId, key);

		const expiresAt = new Date(Date.now() + CHECK_TTL_MINUTES * 60_000);

		try {
			return await conceptCheckRepository.insertSweepingExpired({
				studentId: input.studentId,
				lessonId: input.lessonId,
				courseId,
				concept: input.concept,
				conceptKey: key,
				question: input.question,
				options: shuffled(input.options),
				correct: input.correctOption,
				expiresAt,
			});
		} catch (error) {
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: string }).code === "P2002"
			) {
				throw new CheckAlreadyPendingError(
					"A check is already open for this lesson",
				);
			}
			throw error;
		}
	}

	/**
	 * Grades a check the student owns, exactly once.
	 *
	 * Every one of the four ways this can fail — no such check, someone else's,
	 * already answered, expired — is the same error with the same message. They
	 * are not four cases handled alike; they are one case, because the claim asks
	 * all four questions in a single `WHERE` and simply returns nothing.
	 *
	 * Grading is string equality against the text stored on the claimed row, so
	 * the option order the student saw is the order the server wrote and no index
	 * into the model's authored array is ever consulted.
	 */
	async answer(input: AnswerCheckInput): Promise<AnswerCheckResult> {
		const claimed = await conceptCheckRepository.claimForAnswer(
			input.checkId,
			input.studentId,
		);

		if (!claimed) {
			throw new CheckUnavailableError(
				"This check is no longer available",
				"NOT_FOUND",
			);
		}

		const selected = claimed.options[input.optionIndex] ?? null;

		return {
			isCorrect: selected !== null && selected === claimed.correct,
			correctOption: claimed.correct,
		};
	}
}

export const conceptCheckService = new ConceptCheckService();
