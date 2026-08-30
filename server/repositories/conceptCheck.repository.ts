import type { ConceptCheck, Prisma } from "@/generated/prisma";
import type { db } from "@/server/db";
import { BaseRepository } from "./base/base.repository";

/**
 * A check as the student who must answer it may see it. The type exists so that
 * a component or router reaching for `check.correct` fails `pnpm typecheck`
 * rather than reading `undefined` at runtime — and so the plausible "fix" is not
 * to widen the select.
 *
 * `correct` is the assessment secret. Narrowing here rather than at the caller
 * means it is never loaded, so it cannot be spread into an SSE frame, a history
 * response, or a log line by a caller added later.
 */
export type ConceptCheckPublic = Pick<
	ConceptCheck,
	"id" | "lessonId" | "concept" | "question" | "options" | "expiresAt"
>;

class ConceptCheckRepository extends BaseRepository<
	"conceptCheck",
	ConceptCheck,
	Prisma.ConceptCheckUncheckedCreateInput,
	Prisma.ConceptCheckUpdateInput,
	Prisma.ConceptCheckWhereInput,
	Prisma.ConceptCheckInclude,
	Prisma.ConceptCheckSelect,
	Prisma.ConceptCheckOrderByWithRelationInput
> {
	protected readonly modelName = "conceptCheck" as const;

	/**
	 * The one open check for this student and lesson, or null.
	 *
	 * The column list is written out rather than taken from the row, and
	 * `correct` is not on it. Expiry is compared against `now()` — the database
	 * clock, the same clock the claim uses — so a check this returns is a check
	 * the claim would still accept, and an expired row that the sweep has not
	 * reached yet is invisible here rather than offered and then refused.
	 */
	async findPendingPublic(
		studentId: string,
		lessonId: string,
	): Promise<ConceptCheckPublic | null> {
		const rows = await this.db.$queryRaw<ConceptCheckPublic[]>`
			SELECT id, "lessonId", concept, question, options, "expiresAt"
			FROM concept_checks
			WHERE "studentId" = ${studentId}
				AND "lessonId" = ${lessonId}
				AND status = 'PENDING'::"ConceptCheckStatus"
				AND "expiresAt" > NOW()
			LIMIT 1;
		`;

		return rows[0] ?? null;
	}

	/**
	 * Runs a callback inside one transaction, letting its errors through
	 * unchanged.
	 *
	 * Deliberately not `BaseRepository.transaction`: that funnels every failure
	 * through `handleError`, which discards the original and throws a generic
	 * `Error` carrying only a message. That is right for an unexpected database
	 * failure and wrong here — the answer path throws a domain error on purpose,
	 * one indistinguishable error for four causes, and flattening it would turn a
	 * deliberate refusal into a 500 and lose the property that the four look
	 * alike.
	 */
	async runAtomically<R>(
		callback: (tx: Prisma.TransactionClient) => Promise<R>,
	): Promise<R> {
		return this.db.$transaction(callback);
	}

	/**
	 * How many checks this student has ever been issued on this concept in this
	 * course, in any status. Swept and abandoned ones count: the budget prices
	 * the authoring, which is where the model spend and the enumeration risk both
	 * sit.
	 *
	 * Course-scoped because `ConceptMastery` is: evidence for "Closures" is
	 * recorded once per course, so the budget that gates earning it is counted
	 * once per course too.
	 */
	async countForConcept(
		studentId: string,
		courseId: string,
		conceptKey: string,
	): Promise<number> {
		return this.count({ studentId, courseId, conceptKey });
	}

	/**
	 * How many checks this student has been issued on this lesson, in any status.
	 * The per-lesson ceiling reads it, independently of the per-concept budget.
	 */
	async countForLesson(studentId: string, lessonId: string): Promise<number> {
		return this.count({ studentId, lessonId });
	}

	/**
	 * Whether this student has ever been asked this exact question about this
	 * concept, in any status.
	 *
	 * The comparison is on the stored key, so padding and case cannot make a
	 * repeat look new. It counts swept and expired rows too: the student saw the
	 * question either way, and a wrong answer disclosed its answer.
	 */
	async hasAskedQuestion(
		studentId: string,
		conceptKey: string,
		questionKey: string,
	): Promise<boolean> {
		return (await this.count({ studentId, conceptKey, questionKey })) > 0;
	}

	/**
	 * When this student last answered a check on this concept wrongly, or null.
	 * The cooldown reads it; nothing else does.
	 */
	async lastWrongAnsweredAt(
		studentId: string,
		courseId: string,
		conceptKey: string,
	): Promise<Date | null> {
		const rows = await this.findMany({
			where: { studentId, courseId, conceptKey, isCorrect: false },
			orderBy: { answeredAt: "desc" },
			take: 1,
			select: { answeredAt: true },
		});

		return (
			(rows as unknown as { answeredAt: Date | null }[])[0]?.answeredAt ?? null
		);
	}

	/**
	 * Sweeps this pair's stale `PENDING` rows and inserts the new check in one
	 * transaction, returning it without its key.
	 *
	 * The two statements cannot be split. The partial unique index cannot carry
	 * `expiresAt` — index predicates must be IMMUTABLE — so an abandoned row would
	 * hold the lesson's only slot forever without the sweep, and a sweep in its
	 * own transaction leaves a window where two concurrent issues both see a free
	 * slot and one raises a constraint error instead of the benign result.
	 *
	 * `P2002` from that index is left to the caller to interpret: here it means
	 * the student already has a question waiting, which is not a failure.
	 */
	async insertSweepingExpired(
		data: Pick<
			Prisma.ConceptCheckUncheckedCreateInput,
			| "studentId"
			| "lessonId"
			| "courseId"
			| "concept"
			| "conceptKey"
			| "question"
			| "questionKey"
			| "options"
			| "correct"
			| "expiresAt"
		>,
	): Promise<ConceptCheckPublic> {
		return this.db.$transaction(async (tx) => {
			// `NOW()`, not `new Date()`. The pending read and the claim both compare
			// `expiresAt` against the database clock, and a sweep on the
			// application's would let the two disagree under clock skew: Postgres
			// calls the row expired, the sweep leaves it PENDING, the insert trips
			// the partial unique index, and the student is left with a question
			// `findPendingPublic` will not return and no way to get another.
			await tx.$executeRaw`
				UPDATE "concept_checks"
				SET status = 'EXPIRED'::"ConceptCheckStatus"
				WHERE "studentId" = ${data.studentId}
					AND "lessonId" = ${data.lessonId}
					AND status = 'PENDING'::"ConceptCheckStatus"
					AND "expiresAt" <= NOW()`;

			return tx.conceptCheck.create({
				data,
				select: {
					id: true,
					lessonId: true,
					concept: true,
					question: true,
					options: true,
					expiresAt: true,
				},
			});
		});
	}

	/**
	 * Takes ownership of a check so it can be graded, and returns the whole row —
	 * answer key included — to the caller that won it. Returns null to everyone
	 * else.
	 *
	 * One statement. The four conditions that authorise the answer live in its
	 * `WHERE`, so the query that authorizes is the query that acts (ADR-023):
	 * a `SELECT` first, or a `status` / `expiresAt` test hoisted into TypeScript,
	 * would ask one question and act on another. Single-use then follows from the
	 * statement itself — under READ COMMITTED the loser of a race re-evaluates its
	 * `WHERE` against the updated row and matches nothing, so no lock or retry is
	 * involved.
	 *
	 * Absent, foreign, already-answered and expired all return null, and the
	 * service turns all four into one message: four causes, one error, no oracle
	 * telling a guesser which of them they hit.
	 *
	 * `client` is how this participates in the transaction that also writes
	 * mastery — repository singletons hold `db`, never `tx`, so the caller must
	 * hand its `tx` in for the two writes to be atomic.
	 */
	async claimForAnswer(
		id: string,
		studentId: string,
		client: Prisma.TransactionClient | typeof db = this.db,
	): Promise<ConceptCheck | null> {
		const rows = await client.$queryRaw<ConceptCheck[]>`
			UPDATE concept_checks
			SET status = 'ANSWERED'::"ConceptCheckStatus", "answeredAt" = NOW()
			WHERE id = ${id}
				AND "studentId" = ${studentId}
				AND status = 'PENDING'::"ConceptCheckStatus"
				AND "expiresAt" > NOW()
			RETURNING *;
		`;

		return rows[0] ?? null;
	}
}

export const conceptCheckRepository = new ConceptCheckRepository();
