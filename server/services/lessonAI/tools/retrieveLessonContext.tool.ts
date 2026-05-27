import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";

export const buildRetrieveLessonContextTool = (lessonId: string) =>
	tool(
		async ({ query, k = 4 }: { query: string; k?: number }) => {
			const vector = await embeddingsService.embedQuery(query);
			const chunks = await embeddingRepository.searchLessonChunks(
				lessonId,
				vector,
				k,
			);
			if (chunks.length === 0)
				return "No relevant content found for this lesson.";
			return chunks.map((c) => c.content).join("\n\n---\n\n");
		},
		{
			name: "retrieve_lesson_context",
			description:
				"Returns the most relevant excerpts from the current lesson. Use for questions about this lesson's content. Do NOT use for questions asking which lesson or where in the course something was covered — use search_across_course for those.",
			schema: z.object({
				query: z
					.string()
					.min(2)
					.describe("The question or topic to search for"),
				k: z
					.number()
					.int()
					.min(1)
					.max(8)
					.optional()
					.describe("Number of chunks to retrieve (default 4)"),
			}),
		},
	);
