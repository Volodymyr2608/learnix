import type { Prisma } from "@/generated/prisma";
import { EnrollmentStatus, MasteryEvidence } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import {
	type AttemptPolicy,
	quizAttemptRepository,
} from "@/server/repositories/quizAttempt.repository";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import {
	canonicalConceptName,
	QUIZ_MASTERY_LEVEL,
} from "@/server/services/mastery/masteryLevels";
import { logger } from "@/server/utils/logger";
import {
	AlreadyAttemptedError,
	AttemptLimitError,
	QuizError,
	QuizForbiddenError,
	QuizNotFoundError,
} from "./quiz.errors";

type QuizInput = Pick<
	Prisma.QuizUncheckedCreateInput,
	"question" | "options" | "correct"
>;

/**
 * Never the option count: a student who may try every option arrives at the
 * answer by elimination, which is what removing the key from the response was
 * for. Three is the ceiling, one option short of the set is the rule, and the
 * floor of 1 only covers a malformed single-option quiz — there is nothing to
 * withhold there anyway.
 */
const MAX_GRADED_ATTEMPTS = 3;

/**
 * A spent cap is not a permanent denial: a student who genuinely misunderstood
 * the lesson gets another window, while one cycling options is slowed to a rate
 * at which the attempt record is the signal.
 */
const ATTEMPT_COOLDOWN_HOURS = 24;

const attemptPolicyFor = (options: string[]): AttemptPolicy => ({
	maxAttempts: Math.max(1, Math.min(MAX_GRADED_ATTEMPTS, options.length - 1)),
	cooldownHours: ATTEMPT_COOLDOWN_HOURS,
});

/**
 * The same rule the level-2 tool path already enforced — trim, compare
 * case-insensitively, bound at 80 characters — applied to the level-3 write,
 * which had only a `typeof name === "string"` check in front of unschema'd
 * model JSON. The higher authority should not be the looser path, and both
 * paths now canonicalise through one function so they cannot disagree about
 * the spelling a concept is stored under.
 *
 * The first spelling seen wins, so "  Recursion " and "recursion" become one
 * row named "Recursion" rather than two rows the student appears to have
 * mastered separately.
 *
 * Exported for the contract test that holds the two writers to the same string.
 */
export const canonicalConceptNames = (raw: unknown): string[] => {
	// `insights.concepts` is a JSON column written by a model. A shape that is
	// not an array would make `for … of` throw inside the promotion.
	const entries = Array.isArray(raw) ? (raw as { name?: unknown }[]) : [];
	const canonical = new Map<string, string>();

	for (const entry of entries) {
		if (typeof entry?.name !== "string") continue;
		const name = canonicalConceptName(entry.name);
		if (!name) continue;
		const key = name.toLowerCase();
		if (!canonical.has(key)) canonical.set(key, name);
	}

	return [...canonical.values()];
};

/**
 * What the attempt rows say about how this level was earned. A single unknown
 * count makes the whole promotion LEGACY: the guarantee is "every quiz answered
 * correctly, and here is how many tries that took", and one unknowable row
 * makes that claim unverifiable rather than merely imperfect.
 */
const evidenceFor = (attemptCounts: (number | null)[]): MasteryEvidence => {
	if (attemptCounts.some((count) => count === null)) {
		return MasteryEvidence.LEGACY;
	}
	return attemptCounts.every((count) => count === 1)
		? MasteryEvidence.QUIZ_FIRST_PASS
		: MasteryEvidence.QUIZ_RETRIED;
};

class QuizService {
	private async verifyInstructorOwnership(
		lessonId: string,
		instructorId: string,
	) {
		const lesson = await lessonRepository.findFirst({
			where: {
				id: lessonId,
				deletedAt: null,
				section: { course: { instructorId } },
			},
			select: { id: true },
		});

		if (!lesson) {
			throw new QuizForbiddenError(
				"Lesson not found or access denied",
				"FORBIDDEN",
			);
		}
	}

	private async verifyEnrollment(lessonId: string, studentId: string) {
		const lesson = await lessonRepository.findFirst({
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
			select: { id: true },
		});

		if (!lesson) {
			throw new QuizForbiddenError(
				"Access denied — not enrolled in this course",
				"FORBIDDEN",
			);
		}
	}

	async getByLesson(lessonId: string, studentId: string) {
		try {
			await this.verifyEnrollment(lessonId, studentId);

			const quizzes = await quizRepository.findByLesson(lessonId);

			const attempts = await Promise.all(
				quizzes.map((q) =>
					quizAttemptRepository.findByQuizAndStudent(q.id, studentId),
				),
			);

			return quizzes.map((quiz, i) => ({
				...quiz,
				attempt: attempts[i] ?? null,
			}));
		} catch (error) {
			if (error instanceof QuizForbiddenError) throw error;
			logger.error("Failed to get quizzes for lesson:", error);
			throw new QuizError(
				"Failed to get quizzes",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	async submit(quizId: string, studentId: string, selectedAnswer: string) {
		try {
			// `findFirst`, not `findOne`: the latter is `findUniqueOrThrow`, which
			// knows nothing about soft deletes and turns an id that does not exist
			// into a 500. Both are the caller's mistake, both answer NOT_FOUND, and
			// a client-fault code is what keeps a client sweeping made-up ids from
			// burning the Sentry quota every real failure has to fit inside.
			const quiz = await quizRepository.findFirst({
				where: { id: quizId, deletedAt: null },
			});
			if (!quiz) {
				throw new QuizNotFoundError("Quiz not found", "NOT_FOUND");
			}

			await this.verifyEnrollment(quiz.lessonId, studentId);

			const isCorrect = quiz.correct === selectedAnswer;

			const result = await quizAttemptRepository.recordAttempt(
				quizId,
				studentId,
				selectedAnswer,
				isCorrect,
				attemptPolicyFor(quiz.options),
			);

			if (result.outcome === "already_correct") {
				throw new AlreadyAttemptedError(
					"You have already answered this question correctly",
					"CONFLICT",
				);
			}

			if (result.outcome === "capped") {
				// Says nothing about the submitted answer: telling a capped student
				// whether their last guess was right is the reveal by another door.
				throw new AttemptLimitError(
					"No attempts left for this question",
					"TOO_MANY_REQUESTS",
				);
			}

			const attempt = result.attempt;

			// Confirmation by action: conversation can reach level 2, only finishing
			// every quiz on the lesson reaches 3. Awaited so the write is ordered
			// before the response, but its failure must not fail the submission:
			// the attempt row above is already committed, so throwing here would
			// tell the student "failed to submit" for an answer that was recorded,
			// and their retry would hit AlreadyAttemptedError. Mastery is monotonic
			// and idempotent, so a missed promotion is recoverable; a bogus 500 on
			// a correct answer is not.
			if (isCorrect) {
				try {
					await this.promoteConceptsIfLessonComplete(quiz.lessonId, studentId);
				} catch (err) {
					logger.error("Concept promotion after quiz submit failed:", err);
				}
			}

			void lessonRepository
				.findFirst({
					where: { id: quiz.lessonId, deletedAt: null },
					select: { section: { select: { courseId: true } } },
				})
				.then((lesson) => {
					if (lesson?.section?.courseId) {
						return learningPathRepository.markStale(
							studentId,
							lesson.section.courseId,
						);
					}
				})
				.catch((err) =>
					logger.warn("markStale after quiz submit failed:", err),
				);

			return attempt;
		} catch (error) {
			if (
				error instanceof QuizForbiddenError ||
				error instanceof AlreadyAttemptedError ||
				error instanceof AttemptLimitError ||
				error instanceof QuizNotFoundError
			) {
				throw error;
			}
			logger.error("Failed to submit quiz answer:", error);
			throw new QuizError(
				"Failed to submit quiz answer",
				"INTERNAL_SERVER_ERROR",
				error,
				{ quizId },
			);
		}
	}

	private async promoteConceptsIfLessonComplete(
		lessonId: string,
		studentId: string,
	): Promise<void> {
		const quizzes = await quizRepository.findByLesson(lessonId);
		if (quizzes.length === 0) return;

		const correctCount = await quizAttemptRepository.countDistinctCorrectAmong(
			quizzes.map((quiz) => quiz.id),
			studentId,
		);
		if (correctCount < quizzes.length) return;

		const attemptCounts = await quizAttemptRepository.correctAttemptCountsAmong(
			quizzes.map((quiz) => quiz.id),
			studentId,
		);
		const evidence = evidenceFor(attemptCounts);

		const lesson = await lessonRepository.findFirst({
			where: { id: lessonId, deletedAt: null },
			select: { section: { select: { courseId: true } } },
		});
		const courseId = lesson?.section?.courseId;
		if (!courseId) return;

		const insights = await lessonInsightsRepository.findByLessonId(lessonId);
		const concepts = canonicalConceptNames(insights?.concepts);

		if (concepts.length === 0) return;

		await Promise.all(
			concepts.map((concept) =>
				conceptMasteryRepository.upsertMastery(
					studentId,
					courseId,
					concept,
					QUIZ_MASTERY_LEVEL,
					evidence,
				),
			),
		);

		// One event for the batch, not one per concept: the fact worth recording is
		// that this student completed this lesson's quizzes. The event type has no
		// field a concept name could travel in, which is what keeps that true.
		logSecurityEvent({
			feature: "quizAI",
			userId: studentId,
			layer: "mastery_write",
			outcome: "mastery_promoted",
			ruleIds: ["quiz_lesson_complete"],
			score: 0,
			subject: { kind: "lesson", id: lessonId },
		});
	}

	async upsertMany(
		lessonId: string,
		questions: QuizInput[],
		instructorId: string,
	) {
		try {
			await this.verifyInstructorOwnership(lessonId, instructorId);
			return await quizRepository.replaceForLesson(lessonId, questions);
		} catch (error) {
			if (error instanceof QuizForbiddenError) throw error;
			logger.error("Failed to save quizzes:", error);
			throw new QuizError(
				"Failed to save quizzes",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	async deleteByLesson(lessonId: string, instructorId: string) {
		try {
			await this.verifyInstructorOwnership(lessonId, instructorId);
			return await quizRepository.deleteMany({ lessonId });
		} catch (error) {
			if (error instanceof QuizForbiddenError) throw error;
			logger.error("Failed to delete quizzes:", error);
			throw new QuizError(
				"Failed to delete quizzes",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}
}

export const quizService = new QuizService();
