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
