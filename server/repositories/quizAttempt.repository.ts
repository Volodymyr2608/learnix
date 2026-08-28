import { randomUUID } from "node:crypto";
import type { Prisma, QuizAttempt } from "@/generated/prisma";
import type { QuizAttemptRow } from "@/server/services/learningPathAI/learningPathAI.state";
import { BaseRepository } from "./base/base.repository";

/**
 * Why a union rather than a nullable row: "nothing was written" has two causes
 * with opposite meanings — the student already answered correctly, or they have
 * spent the cap. The caller must be unable to conflate them.
 */
export type RecordAttemptResult =
	| { outcome: "recorded"; attempt: QuizAttempt }
	| { outcome: "already_correct"; attempt: QuizAttempt }
	| { outcome: "capped"; attempt: QuizAttempt };

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
	 * beaten by two submissions racing between a read and a write: a client
	 * firing ten parallel requests would otherwise have all ten read the same
	 * pre-attempt count and all ten be recorded.
	 *
	 * The update writes only while the row is not already correct and the cap is
	 * not spent, so the statement itself is the enforcement. Zero rows is
	 * therefore ambiguous, and the outcome is resolved by reading the row back
	 * rather than by inferring it — `already_correct` and `capped` are different
	 * answers to the student and only one of them is an error.
	 */
	async recordAttempt(
		quizId: string,
		studentId: string,
		selectedAnswer: string,
		isCorrect: boolean,
		maxAttempts: number,
	): Promise<RecordAttemptResult> {
		const id = randomUUID();
		// `attemptCount + 1` on a legacy NULL stays NULL: that row's history is
		// unknown and adding to it would invent one. The same NULL is why the cap
		// predicate admits it — an unknown history is not a spent one.
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
				AND (
					quiz_attempts."attemptCount" IS NULL
					OR quiz_attempts."attemptCount" < ${maxAttempts}
				)
			RETURNING *;
		`;

		const attempt = rows[0];
		if (attempt) return { outcome: "recorded", attempt };

		const existing = await this.findByQuizAndStudent(quizId, studentId);
		if (!existing) {
			// The conflict fired, so a row exists; a missing one means someone
			// deleted it between the two statements, not that nothing happened.
			throw new Error("recordAttempt wrote nothing and found no row");
		}
		if (existing.isCorrect)
			return { outcome: "already_correct", attempt: existing };
		return { outcome: "capped", attempt: existing };
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
