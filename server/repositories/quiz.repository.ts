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
}

export const quizRepository = new QuizRepository();
