import { randomUUID } from "node:crypto";
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

	/**
	 * Records one graded attempt as a single statement, so the cap cannot be
	 * beaten by two submissions racing between a read and a write.
	 *
	 * `null` means the pair already holds a correct answer and nothing was
	 * written — and it means nothing else, which is true only while
	 * `WHERE NOT quiz_attempts."isCorrect"` is the sole predicate on the update.
	 * Any further predicate needs its own distinguishable signal.
	 */
	async recordAttempt(
		quizId: string,
		studentId: string,
		selectedAnswer: string,
		isCorrect: boolean,
	): Promise<QuizAttempt | null> {
		const id = randomUUID();
		// `attemptCount + 1` on a legacy NULL stays NULL: that row's history is
		// unknown and adding to it would invent one.
		const rows = await this.db.$queryRaw<QuizAttempt[]>`
			INSERT INTO quiz_attempts (
				id, "quizId", "studentId", "selectedAnswer", "isCorrect", "attemptCount", "createdAt", "updatedAt"
			)
			VALUES (${id}, ${quizId}, ${studentId}, ${selectedAnswer}, ${isCorrect}, 1, NOW(), NOW())
			ON CONFLICT ("quizId", "studentId")
			DO UPDATE SET
				"selectedAnswer" = EXCLUDED."selectedAnswer",
				"isCorrect" = EXCLUDED."isCorrect",
				"attemptCount" = quiz_attempts."attemptCount" + 1,
				"updatedAt" = NOW()
			WHERE NOT quiz_attempts."isCorrect"
			RETURNING *;
		`;

		return rows[0] ?? null;
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
