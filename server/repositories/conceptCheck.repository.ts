import type { ConceptCheck, Prisma } from "@/generated/prisma";
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
}

export const conceptCheckRepository = new ConceptCheckRepository();
