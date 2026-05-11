import { OpenAIEmbeddings } from "@langchain/openai";
import { env } from "@/lib/env";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { chunkLessonContent } from "./chunker";

const model = new OpenAIEmbeddings({
	model: "text-embedding-3-small",
	apiKey: env.OPENAI_API_KEY,
});

class EmbeddingsService {
	async embedCourse(course: {
		id: string;
		title: string;
		subtitle: string | null;
		description: string | null;
		objectives: string[];
	}) {
		const text = [
			course.title,
			course.subtitle,
			course.description,
			course.objectives.join("\n"),
		]
			.filter(Boolean)
			.join("\n\n");
		const [vector] = await model.embedDocuments([text]);
		if (!vector) throw new Error("Embedding returned no vector");
		await embeddingRepository.upsertCourseEmbedding(course.id, vector);
	}

	async removeCourseEmbedding(courseId: string) {
		await embeddingRepository.deleteCourseEmbedding(courseId);
	}

	async embedLessonChunks(lesson: { id: string; content: string }) {
		const chunks = await chunkLessonContent(lesson.content);
		if (chunks.length === 0) {
			await embeddingRepository.deleteLessonChunks(lesson.id);
			return;
		}
		const vectors = await model.embedDocuments(chunks.map((c) => c.content));
		await embeddingRepository.replaceLessonChunks(lesson.id, chunks, vectors);
	}

	async embedQuery(query: string): Promise<number[]> {
		const [vector] = await model.embedDocuments([query]);
		if (!vector) throw new Error("Embedding returned no vector");
		return vector;
	}

	async recomputeUserInterest(userId: string) {
		await embeddingRepository.recomputeUserInterestFromEnrollments(userId);
	}
}

export const embeddingsService = new EmbeddingsService();
