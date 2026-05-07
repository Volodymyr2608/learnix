import type { Prisma, Quiz } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

export default class QuizRepository extends BaseRepository<
	"quiz",
	Quiz,
	Prisma.QuizUncheckedCreateInput,
	Prisma.QuizUpdateInput,
	Prisma.QuizWhereInput,
	Prisma.QuizInclude,
	Prisma.QuizSelect,
	Prisma.QuizOrderByWithRelationInput
> {
	protected readonly modelName = "quiz";

	async findByLesson(lessonId: string): Promise<Quiz[]> {
		return this.findMany({
			where: { lessonId, deletedAt: null },
			orderBy: { id: "asc" },
		}) as Promise<Quiz[]>;
	}

	async replaceForLesson(
		lessonId: string,
		questions: Pick<
			Prisma.QuizUncheckedCreateInput,
			"question" | "options" | "correct"
		>[],
	): Promise<Quiz[]> {
		return this.transaction(async (tx) => {
			await tx.quiz.deleteMany({ where: { lessonId } });
			return tx.quiz.createManyAndReturn({
				data: questions.map((q) => ({ ...q, lessonId })),
			});
		});
	}
}

export const quizRepository = new QuizRepository();
