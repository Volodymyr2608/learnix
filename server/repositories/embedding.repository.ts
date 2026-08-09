import { randomUUID } from "node:crypto";
import { db } from "@/server/db";

class EmbeddingRepository {
	async upsertCourseEmbedding(courseId: string, vector: number[]) {
		const literal = `[${vector.join(",")}]`;
		await db.$executeRaw`
			INSERT INTO course_embeddings ("courseId", embedding, "updatedAt")
			VALUES (${courseId}, ${literal}::vector, NOW())
			ON CONFLICT ("courseId")
			DO UPDATE SET embedding = EXCLUDED.embedding, "updatedAt" = NOW()
		`;
	}

	async deleteCourseEmbedding(courseId: string) {
		await db.$executeRaw`
			DELETE FROM course_embeddings WHERE "courseId" = ${courseId}
		`;
	}

	async deleteLessonChunks(lessonId: string) {
		await db.$executeRaw`
			DELETE FROM lesson_chunk_embeddings WHERE "lessonId" = ${lessonId}
		`;
	}

	async replaceLessonChunks(
		lessonId: string,
		chunks: Array<{ content: string; index: number }>,
		vectors: number[][],
	) {
		await db.$transaction([
			db.$executeRaw`DELETE FROM lesson_chunk_embeddings WHERE "lessonId" = ${lessonId}`,
			...chunks.map((chunk, i) => {
				const id = randomUUID();
				const literal = vectors[i] ? `[${vectors[i].join(",")}]` : "[]";
				const tokens = Math.ceil(chunk.content.length / 4);
				return db.$executeRaw`
					INSERT INTO lesson_chunk_embeddings (id, "lessonId", "chunkIndex", content, embedding, tokens)
					VALUES (${id}, ${lessonId}, ${chunk.index}, ${chunk.content}, ${literal}::vector, ${tokens})
				`;
			}),
		]);
	}

	async recomputeUserInterestFromEnrollments(userId: string) {
		await db.$executeRaw`
			DELETE FROM user_interest_embeddings WHERE "userId" = ${userId}
		`;
		await db.$executeRaw`
			INSERT INTO user_interest_embeddings ("userId", embedding, "updatedAt")
			SELECT ${userId}, AVG(ce.embedding), NOW()
			FROM course_embeddings ce
			JOIN enrollments e ON e."courseId" = ce."courseId"
			WHERE e."studentId" = ${userId}
				AND e.status = 'active'
			HAVING COUNT(*) > 0
		`;
	}

	async findUserInterest(userId: string): Promise<number[] | null> {
		const rows = await db.$queryRaw<Array<{ embedding: string }>>`
			SELECT embedding::text AS embedding
			FROM user_interest_embeddings
			WHERE "userId" = ${userId}
		`;
		if (rows.length === 0) return null;
		return rows[0] ? JSON.parse(rows[0].embedding) : null;
	}

	async searchCourses(
		queryVector: number[],
		limit: number,
		where?: { category?: string; level?: string },
	) {
		const literal = `[${queryVector.join(",")}]`;
		const params: unknown[] = [literal];
		const conditions = ["c.status = 'published'", "c.deleted_at IS NULL"];
		if (where?.category) {
			params.push(where.category);
			conditions.push(`c.category = $${params.length}`);
		}
		if (where?.level) {
			params.push(where.level);
			conditions.push(`c.level = $${params.length}`);
		}
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

		const sql = `
			SELECT c.id, ce.embedding <=> $1::vector AS distance
			FROM course_embeddings ce
			JOIN courses c ON c.id = ce."courseId"
			WHERE ${conditions.join(" AND ")}
			ORDER BY distance ASC
			LIMIT ${safeLimit}
		`;

		return db.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
			sql,
			...params,
		);
	}

	async searchCoursesExcluding(
		queryVector: number[],
		limit: number,
		excludeIds: string[],
	) {
		const literal = `[${queryVector.join(",")}]`;
		const params: unknown[] = [literal];
		const conditions = ["c.status = 'published'", "c.deleted_at IS NULL"];
		if (excludeIds.length > 0) {
			const placeholders = excludeIds.map((id) => {
				params.push(id);
				return `$${params.length}`;
			});
			conditions.push(`c.id NOT IN (${placeholders.join(", ")})`);
		}
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

		const sql = `
			SELECT c.id, ce.embedding <=> $1::vector AS distance
			FROM course_embeddings ce
			JOIN courses c ON c.id = ce."courseId"
			WHERE ${conditions.join(" AND ")}
			ORDER BY distance ASC
			LIMIT ${safeLimit}
		`;

		return db.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
			sql,
			...params,
		);
	}

	async searchLessonChunks(lessonId: string, queryVector: number[], k: number) {
		const literal = `[${queryVector.join(",")}]`;
		return db.$queryRaw<Array<{ content: string; distance: number }>>`
			SELECT lce.content, lce.embedding <=> ${literal}::vector AS distance
			FROM lesson_chunk_embeddings lce
			JOIN lessons l ON l.id = lce."lessonId"
			WHERE lce."lessonId" = ${lessonId}
				AND l.deleted_at IS NULL
			ORDER BY distance ASC
			LIMIT ${k}
		`;
	}

	async searchCourseChunks(courseId: string, queryVector: number[], k: number) {
		const literal = `[${queryVector.join(",")}]`;
		return db.$queryRaw<
			Array<{ content: string; lessonTitle: string; distance: number }>
		>`
			SELECT lce.content, l.title AS "lessonTitle", lce.embedding <=> ${literal}::vector AS distance
			FROM lesson_chunk_embeddings lce
			JOIN lessons l ON l.id = lce."lessonId"
			JOIN sections s ON s.id = l."sectionId"
			WHERE s."courseId" = ${courseId}
				AND l.deleted_at IS NULL
			ORDER BY distance ASC
			LIMIT ${k}
		`;
	}
}

export const embeddingRepository = new EmbeddingRepository();
