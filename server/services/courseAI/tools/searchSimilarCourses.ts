import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { courseRepository } from "@/server/repositories/course.repository";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { CourseAIToolError } from "@/server/services/courseAI/courseAI.errors";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import { logger } from "@/server/utils/logger";

export const searchSimilarCoursesTool = tool(
	async ({ query, limit = 5 }) => {
		try {
			const vector = await embeddingsService.embedQuery(query);
			const hits = await embeddingRepository.searchCourses(vector, limit);
			if (hits.length === 0) return JSON.stringify({ results: [] });

			const ids = hits.map((h) => h.id);
			const courses = await courseRepository.findMany({
				where: { id: { in: ids }, deletedAt: null },
				select: { id: true, title: true, subtitle: true },
			});

			const distanceMap = new Map(hits.map((h) => [h.id, h.distance]));
			const results = ids
				.map((id) => {
					const course = courses.find((c) => c.id === id);
					if (!course) return null;
					return {
						id,
						title: course.title,
						subtitle: course.subtitle ?? null,
						distance: distanceMap.get(id) ?? null,
					};
				})
				.filter(Boolean);

			// Titles and subtitles written by *other* instructors — the widest
			// untrusted surface in courseAI, since the author of this text is not
			// even the person running the generation.
			return wrapUntrustedContent(JSON.stringify({ results }), "course_data");
		} catch (err) {
			logger.error(
				new CourseAIToolError(`search_similar_courses: ${String(err)}`),
			);
			return JSON.stringify({
				error: "tool failed; proceed without similar-course context",
			});
		}
	},
	{
		name: "search_similar_courses",
		description:
			"Search published courses by semantic similarity. Returns top results with title and subtitle.",
		schema: z.object({
			query: z.string().describe("Search query"),
			limit: z
				.number()
				.int()
				.min(1)
				.max(10)
				.optional()
				.describe("How many results (default 5)"),
		}),
	},
);
