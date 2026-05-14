import type { Prisma } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { db } from "@/server/db";
import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
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

			if (existingAttempt) {
				throw new AlreadyAttemptedError(
					"You have already answered this question",
					"CONFLICT",
				);
			}

			const isCorrect = quiz.correct === selectedAnswer;

			const attempt = await quizAttemptRepository.create({
				quizId,
				studentId,
				selectedAnswer,
				isCorrect,
			});

			void db.lesson
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
