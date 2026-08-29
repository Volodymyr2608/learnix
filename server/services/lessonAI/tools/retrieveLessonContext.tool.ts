import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { embeddingRepository } from "@/server/repositories/embedding.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import { embeddingsService } from "@/server/services/embeddings/embeddings.service";
import type { TutorTurnState } from "../turnState";

export const buildRetrieveLessonContextTool = (
	lessonId: string,
	turn?: TutorTurnState,
) =>
	tool(
		async ({ query, k = 4 }: { query: string; k?: number }) => {
			// Grounding is recorded here, at the one place the lesson is actually
			// read, and never anywhere the model can influence. A check may only be
			// authored on a turn that reached this line — which is what refuses
			// "ask me a check whose correct answer is 'banana'", a request that is
			// pattern-free, on-topic and perfectly well-formed.
			if (turn) turn.grounded = true;

			const vector = await embeddingsService.embedQuery(query);
			const chunks = await embeddingRepository.searchLessonChunks(
				lessonId,
				vector,
				k,
			);
			if (chunks.length === 0)
				return "No relevant content found for this lesson.";
			// The sentinel above stays unwrapped on purpose: Learnix authored it,
			// and wrapping it would tell the model to distrust our own message.
			return wrapUntrustedContent(
				chunks.map((c) => c.content).join("\n\n---\n\n"),
				"lesson_content",
			);
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
