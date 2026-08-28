import { randomUUID } from "node:crypto";
import type { Prisma, QuizAttempt } from "@/generated/prisma";
import type { QuizAttemptRow } from "@/server/services/learningPathAI/learningPathAI.state";
import { BaseRepository } from "./base/base.repository";

/**
 * Why a union rather than a nullable row: "nothing was written" has two causes
 * with opposite meanings — the student already answered correctly, or they have
 * spent the cap. The caller must be unable to conflate them.
 */
/**
 * The bound on guessing, read straight into the statement that writes the
 * attempt: how many graded attempts a window allows, and how long a spent window
 * lasts. Derived from the attempt row itself, never from in-process state, so it
 * survives a restart.
 */
export type AttemptPolicy = {
	maxAttempts: number;
	cooldownHours: number;
};

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
		policy: AttemptPolicy,
	): Promise<RecordAttemptResult> {
		const id = randomUUID();
		const { maxAttempts, cooldownHours } = policy;
		// Two NULL behaviours, both deliberate. `attemptCount < maxAttempts` is
		// NULL — not true — for a row of unknown history, so such a row is never
		// admitted by the cap and falls through to the cooldown branch: one attempt
		// per window. And `attemptCount + 1` on NULL stays NULL, so it keeps saying
		// "unknown" rather than claiming a history it does not have, which is what
		// a later promotion reads to mark its evidence as legacy.
		const rows = await this.db.$queryRaw<QuizAttempt[]>`
			INSERT INTO quiz_attempts (
				id, "quizId", "studentId", "selectedAnswer", "isCorrect", "attemptCount", "createdAt", "updatedAt"
			)
			VALUES (${id}, ${quizId}, ${studentId}, ${selectedAnswer}, ${isCorrect}, 1, NOW(), NOW())
			ON CONFLICT ("quizId", "studentId")
			DO UPDATE SET
				"selectedAnswer" = EXCLUDED."selectedAnswer",
				"isCorrect" = EXCLUDED."isCorrect",
				"attemptCount" = CASE
					WHEN quiz_attempts."updatedAt" < NOW() - (${cooldownHours} * INTERVAL '1 hour')
						AND quiz_attempts."attemptCount" IS NOT NULL
					THEN 1
					ELSE quiz_attempts."attemptCount" + 1
				END,
				"updatedAt" = NOW()
			WHERE NOT quiz_attempts."isCorrect"
				AND (
					quiz_attempts."attemptCount" < ${maxAttempts}
					OR quiz_attempts."updatedAt" < NOW() - (${cooldownHours} * INTERVAL '1 hour')
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
	 * Counts DISTINCT quizzes answered correctly, not attempt rows. The unique
	 * constraint on (quizId, studentId) now makes a second row impossible, but
	 * rows written before it — a double-click against the old read-then-write
	 * submit — can still be in the table. Counting rows would read those as
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

	/**
	 * How many attempts each correct answer took, for the quizzes given. A NULL
	 * entry is a row that predates the counter: how many tries it took is
	 * unknowable, which is a different fact from "one try" and must stay
	 * distinguishable from it.
	 */
	async correctAttemptCountsAmong(
		quizIds: string[],
		studentId: string,
	): Promise<(number | null)[]> {
		const rows = await this.findMany({
			where: { quizId: { in: quizIds }, studentId, isCorrect: true },
			distinct: ["quizId"],
			select: { attemptCount: true },
		});
		return (rows as unknown as { attemptCount: number | null }[]).map(
			(row) => row.attemptCount,
		);
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
