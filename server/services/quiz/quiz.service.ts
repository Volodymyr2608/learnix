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
	QuizError,
	QuizForbiddenError,
} from "./quiz.errors";

type QuizInput = Pick<
	Prisma.QuizUncheckedCreateInput,
	"question" | "options" | "correct"
>;

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

			const existingAttempt = await quizAttemptRepository.findByQuizAndStudent(
				quizId,
				studentId,
			);

			if (existingAttempt?.isCorrect) {
				throw new AlreadyAttemptedError(
					"You have already answered this question correctly",
					"CONFLICT",
				);
			}

			const isCorrect = quiz.correct === selectedAnswer;

			const attempt = existingAttempt
				? await quizAttemptRepository.update(existingAttempt.id, {
						selectedAnswer,
						isCorrect,
					})
				: await quizAttemptRepository.create({
						quizId,
						studentId,
						selectedAnswer,
						isCorrect,
					});

			// Confirmation by action: conversation can reach level 2, only finishing
			// every quiz on the lesson reaches 3. Awaited, not fire-and-forget —
			// unlike markStale below, this is a correctness-critical write.
			if (isCorrect) {
				await this.promoteConceptsIfLessonComplete(quiz.lessonId, studentId);
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
				error instanceof AlreadyAttemptedError
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

		const correctCount = await quizAttemptRepository.countCorrectAmong(
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
		const concepts = (insights?.concepts as { name: string }[] | null) ?? [];

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
