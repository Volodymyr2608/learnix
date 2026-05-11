import { RunnableSequence } from "@langchain/core/runnables";
import type { SemanticSearchDto } from "@/server/entities/search";
import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { traced } from "@/server/services/_shared/tracing";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { logger } from "@/server/utils/logger";
import { SearchError } from "./search.errors";

class SearchService {
	private readonly chain = RunnableSequence.from([
		async (input: SemanticSearchDto) => ({
			...input,
			vector: await embeddingsService.embedQuery(input.query),
		}),
		async (input: SemanticSearchDto & { vector: number[] }) =>
			embeddingRepository.searchCourses(input.vector, input.limit ?? 20, {
				category: input.category,
				level: input.level,
			}),
		async (rows: Array<{ id: string; distance: number }>) =>
			courseRepository.findManyByIdsPreservingOrder(rows.map((r) => r.id)),
	]);

	async semantic(input: SemanticSearchDto) {
		try {
			return await traced(
				"search.semantic",
				(i: SemanticSearchDto) => this.chain.invoke(i),
				{ feature: "search" },
			)(input);
		} catch (error) {
			logger.error("Semantic search failed:", error);
			throw new SearchError(
				"Semantic search failed",
				"INTERNAL_SERVER_ERROR",
				error,
				{ query: input.query },
			);
		}
	}
}

export const searchService = new SearchService();
