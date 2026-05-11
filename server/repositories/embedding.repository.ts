import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";

class EmbeddingRepository {
	async upsertCourseEmbedding(courseId: string, vector: number[]) {
		const literal = `[${vector.join(",")}]`;
		await db.$executeRaw`
			INSERT INTO "CourseEmbedding" ("courseId", embedding, "updatedAt")
			VALUES (${courseId}, ${literal}::vector, NOW())
			ON CONFLICT ("courseId")
			DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW()
		`;
	}

	async deleteLessonChunks(lessonId: string) {
		await db.$executeRaw`
			DELETE FROM "LessonChunkEmbedding" WHERE "lessonId" = ${lessonId}
		`;
	}

	async replaceLessonChunks(
		lessonId: string,
		chunks: Array<{ content: string; index: number }>,
		vectors: number[][],
	) {
		await db.$transaction([
			db.$executeRaw`DELETE FROM "LessonChunkEmbedding" WHERE "lessonId" = ${lessonId}`,
			...chunks.map((chunk, i) => {
				const id = randomUUID();
				const literal = `[${vectors[i]!.join(",")}]`;
				const tokens = Math.ceil(chunk.content.length / 4);
				return db.$executeRaw`
					INSERT INTO "LessonChunkEmbedding" (id, "lessonId", "chunkIndex", content, embedding, tokens)
					VALUES (${id}, ${lessonId}, ${chunk.index}, ${chunk.content}, ${literal}::vector, ${tokens})
				`;
			}),
		]);
	}

	async recomputeUserInterestFromEnrollments(userId: string) {
		await db.$executeRaw`
			DELETE FROM "UserInterestEmbedding" WHERE "userId" = ${userId}
		`;
		await db.$executeRaw`
			INSERT INTO "UserInterestEmbedding" ("userId", embedding, "updatedAt")
			SELECT ${userId}, AVG(ce.embedding), NOW()
			FROM "CourseEmbedding" ce
			JOIN enrollments e ON e."courseId" = ce."courseId"
			WHERE e."studentId" = ${userId}
				AND e.status = 'active'
			HAVING COUNT(*) > 0
		`;
	}

	async findUserInterest(userId: string): Promise<number[] | null> {
		const rows = await db.$queryRaw<Array<{ embedding: string }>>`
			SELECT embedding::text AS embedding
			FROM "UserInterestEmbedding"
			WHERE "userId" = ${userId}
		`;
		if (rows.length === 0) return null;
		return JSON.parse(rows[0]!.embedding);
	}

	async searchCourses(
		queryVector: number[],
		limit: number,
		where?: { category?: string; level?: string },
	) {
		const literal = `[${queryVector.join(",")}]`;
		const categoryClause = where?.category
			? Prisma.sql`AND c.category = ${where.category}`
			: Prisma.empty;
		const levelClause = where?.level
			? Prisma.sql`AND c.level = ${where.level}`
			: Prisma.empty;

		return db.$queryRaw<Array<{ id: string; distance: number }>>`
			SELECT c.id, ce.embedding <=> ${literal}::vector AS distance
			FROM "CourseEmbedding" ce
			JOIN courses c ON c.id = ce."courseId"
			WHERE c.status = 'published'
				AND c.deleted_at IS NULL
				${categoryClause}
				${levelClause}
			ORDER BY distance ASC
			LIMIT ${limit}
		`;
	}

	async searchCoursesExcluding(
		queryVector: number[],
		limit: number,
		excludeIds: string[],
	) {
		const literal = `[${queryVector.join(",")}]`;
		const excludeClause =
			excludeIds.length > 0
				? Prisma.sql`AND c.id NOT IN (${Prisma.join(excludeIds.map((id) => Prisma.sql`${id}`))})`
				: Prisma.empty;

		return db.$queryRaw<Array<{ id: string; distance: number }>>`
			SELECT c.id, ce.embedding <=> ${literal}::vector AS distance
			FROM "CourseEmbedding" ce
			JOIN courses c ON c.id = ce."courseId"
			WHERE c.status = 'published'
				AND c.deleted_at IS NULL
				${excludeClause}
			ORDER BY distance ASC
			LIMIT ${limit}
		`;
	}
}

export const embeddingRepository = new EmbeddingRepository();
