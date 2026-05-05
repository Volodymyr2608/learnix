import type { Quiz } from "@/generated/prisma";
import type { LessonContentUpdateDto } from "@/server/entities/lesson";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { LessonError } from "./lesson.errors";

class LessonService {
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

			return await lessonRepository.transaction(async () => {
				const updated = await lessonRepository.update(lessonId, {
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

				return updated;
			});
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
