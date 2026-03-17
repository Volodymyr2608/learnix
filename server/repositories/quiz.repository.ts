import type { Quiz } from "@/generated/prisma";
import type { QuizCreateDto, QuizUpdateDto } from "@/server/entities/course";
import BaseRepository from "@/server/repositories/baseRepository";

export default class QuizRepository extends BaseRepository<
	Quiz,
	QuizCreateDto,
	QuizUpdateDto
> {
	protected readonly model = "quiz";
}

export const quizRepository = new QuizRepository();
