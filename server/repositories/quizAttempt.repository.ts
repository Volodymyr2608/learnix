import type { Prisma, QuizAttempt } from "@/generated/prisma";
import type { QuizAttemptRow } from "@/server/services/learningPathAI/learningPathAI.state";
import { BaseRepository } from "./base/base.repository";

class QuizAttemptRepository extends BaseRepository<
	"quizAttempt",
	QuizAttempt,
	Prisma.QuizAttemptUncheckedCreateInput,
	Prisma.QuizAttemptUpdateInput,
	Prisma.QuizAttemptWhereInput,
	Prisma.QuizAttemptInclude,
	Prisma.QuizAttemptSelect,
	Prisma.QuizAttemptOrderByWithRelationInput
> {
	protected readonly modelName = "quizAttempt" as const;

	async findByQuizAndStudent(quizId: string, studentId: string) {
		return this.findFirst({ where: { quizId, studentId } });
	}

	countCorrect(studentId: string): Promise<number> {
		return this.count({ studentId, isCorrect: true });
	}

	countCorrectAmong(quizIds: string[], studentId: string): Promise<number> {
		return this.count({ quizId: { in: quizIds }, studentId, isCorrect: true });
	}

	async latestPerQuizForStudent(
		studentId: string,
		courseId: string,
	): Promise<QuizAttemptRow[]> {
		const rows = await this.findMany({
			where: { studentId, quiz: { lesson: { section: { courseId } } } },
			include: { quiz: { select: { lessonId: true } } },
			orderBy: { createdAt: "desc" },
		});
		return (rows as (QuizAttempt & { quiz: { lessonId: string } })[]).map(
			(r) => ({
				quizId: r.quizId,
				lessonId: r.quiz.lessonId,
				isCorrect: r.isCorrect,
				attemptedAt: r.createdAt,
			}),
		);
	}
}

export const quizAttemptRepository = new QuizAttemptRepository();
