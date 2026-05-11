import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";

export const buildSearchAcrossCourseTool = (courseId: string) =>
  tool(
    async ({ query, k = 4 }: { query: string; k?: number }) => {
      const vector = await embeddingsService.embedQuery(query);
      const chunks = await embeddingRepository.searchCourseChunks(courseId, vector, k);
      if (chunks.length === 0) return "No relevant content found across this course.";
      return chunks
        .map((c) => `[Lesson: ${c.lessonTitle}] ${c.content}`)
        .join("\n\n---\n\n");
    },
    {
      name: "search_across_course",
      description:
        "Searches all lessons in this course for relevant excerpts. Use for questions like 'where did we cover X' or to surface prerequisite material.",
      schema: z.object({
        query: z.string().min(2).describe("The concept or topic to search for across the course"),
        k: z.number().int().min(1).max(8).optional().describe("Number of chunks to retrieve (default 4)"),
      }),
    },
  );