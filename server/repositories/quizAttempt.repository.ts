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

	/**
	 * Counts DISTINCT quizzes answered correctly, not attempt rows. `QuizAttempt`
	 * has no unique constraint on (quizId, studentId) and `submit()` does
	 * read-then-write, so two concurrent submissions of the same quiz — a
	 * double-click — leave two correct rows. Counting rows would then read as
	 * "every quiz on the lesson is done" with a quiz still unanswered, and the
	 * level-3 promotion it gates is irreversible once written.
	 */
	async countDistinctCorrectAmong(
		quizIds: string[],
		studentId: string,
	): Promise<number> {
		const rows = await this.findMany({
			where: { quizId: { in: quizIds }, studentId, isCorrect: true },
			distinct: ["quizId"],
			select: { quizId: true },
		});
		return rows.length;
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
