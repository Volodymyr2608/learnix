import type { Prisma, Quiz } from "@/generated/prisma";
import { BaseRepository } from "@/server/repositories/base/base.repository";

/**
 * A quiz as a student may see it. The type exists so that a component reaching
 * for `quiz.correct` fails `pnpm typecheck` rather than reading `undefined` at
 * runtime — and so the plausible "fix" is not to put the field back.
 */
export type StudentQuiz = Pick<
	Quiz,
	"id" | "question" | "options" | "lessonId"
>;

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

	/**
	 * The student field set — the four fields its three callers read, and no
	 * `deletedAt`, which the `where` clause already guarantees is null.
	 * `correct` is an assessment secret: narrowing here rather than at the caller
	 * means it is never loaded, so it cannot be spread into a response, written to
	 * a log line, or re-exposed by a caller added later. Grading reads the whole
	 * row through `findOne`, which is a different door.
	 *
	 * `orderBy: { id: "asc" }` is load-bearing — `quizService.getByLesson` pairs
	 * quizzes with attempts positionally.
	 */
	async findByLesson(lessonId: string): Promise<StudentQuiz[]> {
		return this.findMany({
			where: { lessonId, deletedAt: null },
			orderBy: { id: "asc" },
			select: {
				id: true,
				question: true,
				options: true,
				lessonId: true,
			},
		}) as unknown as Promise<StudentQuiz[]>;
	}

	/**
	 * The promotion accessor: which concept each live question tests, and nothing
	 * else. Separate from `findByLesson` so the student payload does not grow a
	 * field only the grader needs, and separate from the author's accessor so it
	 * never loads the answer key.
	 */
	async findConceptTagsByLesson(
		lessonId: string,
	): Promise<{ id: string; concept: string | null }[]> {
		return this.findMany({
			where: { lessonId, deletedAt: null },
			orderBy: { id: "asc" },
			select: { id: true, concept: true },
		}) as unknown as Promise<{ id: string; concept: string | null }[]>;
	}

	/**
	 * The author's field set — the whole row, answer key included, for the
	 * instructor who owns the lesson. A separate method rather than a flag on
	 * `findByLesson`: the audience is then chosen at the call site and visible in
	 * review, where a boolean argument would be one typo away from handing a
	 * student the key. Callers must have verified ownership first.
	 */
	async findByLessonForAuthor(lessonId: string): Promise<Quiz[]> {
		return this.findMany({
			where: { lessonId, deletedAt: null },
			orderBy: { id: "asc" },
		}) as Promise<Quiz[]>;
	}

	/**
	 * Soft-deletes the lesson's current questions and creates the new set.
	 *
	 * A hard delete cascades to `QuizAttempt` (`onDelete: Cascade`), so saving the
	 * quiz tab wiped every student's attempt history for that lesson: their caps
	 * and cooldowns reset, and the rows a level-3 `evidence` value points at were
	 * gone — with nothing archived, unlike the one other place in this feature
	 * that deletes attempt rows. The attempts stay attached to the soft-deleted
	 * questions, which no student read returns.
	 */
	async replaceForLesson(
		lessonId: string,
		questions: Pick<
			Prisma.QuizUncheckedCreateInput,
			"question" | "options" | "correct" | "concept"
		>[],
	): Promise<Quiz[]> {
		return this.transaction(async (tx) => {
			await tx.quiz.updateMany({
				where: { lessonId, deletedAt: null },
				data: { deletedAt: new Date() },
			});
			return tx.quiz.createManyAndReturn({
				data: questions.map((q) => ({ ...q, lessonId })),
			});
		});
	}
}

export const quizRepository = new QuizRepository();
