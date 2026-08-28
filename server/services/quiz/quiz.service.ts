import type { Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { conceptMasteryRepository } from "@/server/repositories/conceptMastery.repository";
import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { quizAttemptRepository } from "@/server/repositories/quizAttempt.repository";
import { logger } from "@/server/utils/logger";
import {
	AlreadyAttemptedError,
	AttemptLimitError,
	QuizError,
	QuizForbiddenError,
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

const attemptCapFor = (options: string[]): number =>
	Math.max(1, Math.min(MAX_GRADED_ATTEMPTS, options.length - 1));

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
			const quiz = await quizRepository.findOne(quizId);

			await this.verifyEnrollment(quiz.lessonId, studentId);

			const isCorrect = quiz.correct === selectedAnswer;

			const result = await quizAttemptRepository.recordAttempt(
				quizId,
				studentId,
				selectedAnswer,
				isCorrect,
				attemptCapFor(quiz.options),
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
				error instanceof AttemptLimitError
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

		const lesson = await lessonRepository.findFirst({
			where: { id: lessonId, deletedAt: null },
			select: { section: { select: { courseId: true } } },
		});
		const courseId = lesson?.section?.courseId;
		if (!courseId) return;

		const insights = await lessonInsightsRepository.findByLessonId(lessonId);
		// LLM-generated JSON with no schema behind it. An entry missing `name`
		// would reach the NOT NULL `concept` column as undefined.
		const concepts = (
			(insights?.concepts as { name?: unknown }[] | null) ?? []
		).filter(
			(concept): concept is { name: string } =>
				typeof concept?.name === "string" && concept.name.length > 0,
		);

		await Promise.all(
			concepts.map((concept) =>
				conceptMasteryRepository.upsertMastery(
					studentId,
					courseId,
					concept.name,
					3,
				),
			),
		);
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
