import type { Quiz } from "@/generated/prisma";
import { EnrollmentStatus } from "@/generated/prisma";
import { db } from "@/server/db";
import type { LessonContentUpdateDto } from "@/server/entities/lesson";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonProgressRepository } from "@/server/repositories/lessonProgress.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { notificationService } from "@/server/services/notifications/notification.service";
import { logger } from "@/server/utils/logger";
import { LessonError } from "./lesson.errors";

class LessonService {
	private markStaleForLesson(lessonId: string, studentId: string) {
		void lessonRepository
			.findFirst({
				where: { id: lessonId, deletedAt: null },
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
				logger.warn("markStale after lesson progress change failed:", err),
			);
	}

	private async fetchVerified(lessonId: string, instructorId: string) {
		const lesson = await lessonRepository.findFirst({
			where: {
				id: lessonId,
				deletedAt: null,
				section: {
					course: { instructorId },
				},
			},
			include: {
				quizzes: { where: { deletedAt: null }, orderBy: { id: "asc" } },
			},
		});

		if (!lesson) {
			throw new LessonError("Lesson not found or access denied", "NOT_FOUND");
		}

		return lesson as typeof lesson & { quizzes: Quiz[] };
	}

	async getLesson(lessonId: string, instructorId: string) {
		try {
			return await this.fetchVerified(lessonId, instructorId);
		} catch (error) {
			if (error instanceof LessonError) throw error;
			throw new LessonError(
				"Failed to get lesson",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	async updateLessonContent(
		lessonId: string,
		dto: LessonContentUpdateDto,
		instructorId: string,
	) {
		try {
			const existing = await this.fetchVerified(lessonId, instructorId);

			const updated = await lessonRepository.transaction(async () => {
				const result = await lessonRepository.update(lessonId, {
					title: dto.title,
					description: dto.description ?? null,
					duration: dto.duration ?? null,
					videoUrl: dto.videoUrl ?? null,
					content: dto.content ?? null,
					resources: dto.resources ?? [],
				});

				if (dto.quizzes !== undefined) {
					await this.syncQuizzes(lessonId, dto.quizzes, existing.quizzes);
				}

				return result;
			});

			if (updated.content) {
				void embeddingsService
					.embedLessonChunks({ id: lessonId, content: updated.content })
					.catch((err) => logger.error("embedLessonChunks failed:", err));
			}

			return updated;
		} catch (error) {
			if (error instanceof LessonError) throw error;
			throw new LessonError(
				"Failed to update lesson",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	async getStudentLesson(lessonId: string, studentId: string) {
		try {
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
				include: {
					quizzes: { where: { deletedAt: null }, orderBy: { id: "asc" } },
				},
			});

			if (!lesson) {
				throw new LessonError("Lesson not found or access denied", "NOT_FOUND");
			}

			return lesson as typeof lesson & { quizzes: Quiz[] };
		} catch (error) {
			if (error instanceof LessonError) throw error;
			throw new LessonError(
				"Failed to get lesson",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	async markLessonComplete(lessonId: string, studentId: string) {
		try {
			await this.getStudentLesson(lessonId, studentId);
			await db.lessonProgress.upsert({
				where: { lessonId_studentId: { lessonId, studentId } },
				create: {
					lessonId,
					studentId,
					isCompleted: true,
					completedAt: new Date(),
				},
				update: { isCompleted: true, completedAt: new Date() },
			});
			this.markStaleForLesson(lessonId, studentId);
			void this.syncProgressAndFireEvents(lessonId, studentId);
		} catch (error) {
			if (error instanceof LessonError) throw error;
			throw new LessonError(
				"Failed to mark lesson complete",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	private async syncProgressAndFireEvents(
		lessonId: string,
		studentId: string,
	): Promise<void> {
		try {
			const lessonWithSection = await lessonRepository.findFirst({
				where: { id: lessonId, deletedAt: null },
				select: { section: { select: { courseId: true } } },
			});
			const courseId = lessonWithSection?.section?.courseId;
			if (!courseId) return;

			const [totalLessons, completedLessons] = await Promise.all([
				lessonRepository.count({ section: { courseId }, deletedAt: null }),
				lessonProgressRepository.countCompleted(studentId, courseId),
			]);

			if (totalLessons === 0) return;

			const progressPct = Math.round((completedLessons / totalLessons) * 100);
			const lessonsRemaining = totalLessons - completedLessons;

			const enrollment = await enrollmentRepository.findFirst({
				where: { studentId, courseId },
			});
			if (!enrollment) return;

			if (progressPct === 100) {
				await enrollmentRepository.update(enrollment.id, {
					progress: 100,
					completedAt: enrollment.completedAt ?? new Date(),
					status: "completed",
				});
				void notificationService
					.fireCertificateEarned(enrollment.id)
					.catch((err) => logger.warn("fireCertificateEarned failed:", err));
			} else {
				await enrollmentRepository.update(enrollment.id, {
					progress: progressPct,
				});

				if (lessonsRemaining === 1 || lessonsRemaining === 2) {
					const completedIds = await lessonProgressRepository.findCompletedIds(
						studentId,
						courseId,
					);

					const nextLesson = await lessonRepository.findFirst({
						where: {
							section: { courseId },
							deletedAt: null,
							id: { notIn: completedIds },
						},
						select: { id: true, title: true },
					});

					void notificationService
						.fireProgressNearCompletion(studentId, courseId, {
							completedLessons,
							totalLessons,
							lessonsRemaining,
							nextLessonId: nextLesson?.id ?? null,
							nextLessonTitle: nextLesson?.title ?? "",
						})
						.catch((err) =>
							logger.warn("fireProgressNearCompletion failed:", err),
						);
				}
			}
		} catch (err) {
			logger.warn("syncProgressAndFireEvents failed:", err);
		}
	}

	async markLessonIncomplete(lessonId: string, studentId: string) {
		try {
			await this.getStudentLesson(lessonId, studentId);
			await db.lessonProgress.upsert({
				where: { lessonId_studentId: { lessonId, studentId } },
				create: { lessonId, studentId, isCompleted: false },
				update: { isCompleted: false, completedAt: null },
			});
			this.markStaleForLesson(lessonId, studentId);
		} catch (error) {
			if (error instanceof LessonError) throw error;
			throw new LessonError(
				"Failed to mark lesson incomplete",
				"INTERNAL_SERVER_ERROR",
				error,
				{ lessonId },
			);
		}
	}

	private async syncQuizzes(
		lessonId: string,
		incoming: NonNullable<LessonContentUpdateDto["quizzes"]>,
		existing: Quiz[],
	) {
		type IncomingQuiz = (typeof incoming)[number];
		type IncomingQuizWithId = IncomingQuiz & { id: string };

		const existingIds = new Set(existing.map((q) => q.id));

		const toUpdate = incoming.filter(
			(q): q is IncomingQuizWithId => !!q.id && existingIds.has(q.id),
		);
		const toCreate = incoming.filter((q) => !q.id || !existingIds.has(q.id));
		const keptIds = new Set(toUpdate.map((q) => q.id));
		const toDelete = existing.filter((q) => !keptIds.has(q.id));

		for (const quiz of toUpdate) {
			await quizRepository.update(quiz.id, {
				question: quiz.question,
				options: quiz.options,
				correct: quiz.options[quiz.correctAnswer] ?? "",
			});
		}

		for (const quiz of toCreate) {
			await quizRepository.create({
				lessonId,
				question: quiz.question,
				options: quiz.options,
				correct: quiz.options[quiz.correctAnswer] ?? "",
			});
		}

		for (const quiz of toDelete) {
			await quizRepository.delete(quiz.id);
		}
	}
}

export const lessonService = new LessonService();
