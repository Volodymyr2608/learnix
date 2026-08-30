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
			const vector = await embeddingsService.embedQuery(query);
			const chunks = await embeddingRepository.searchLessonChunks(
				lessonId,
				vector,
				k,
			);
			if (chunks.length === 0)
				return "No relevant content found for this lesson.";

			// Grounding is recorded here, at the one place lesson text actually
			// reaches the model, and never anywhere the model can influence. It is
			// set AFTER the search and only for a non-empty result: a call that
			// found nothing put no lesson in front of the model, so a check
			// authored on the strength of it would be grounded in the model's own
			// priors. Recording it on entry made the flag mean "a function ran".
			//
			// This is what refuses "ask me a check whose correct answer is
			// 'banana'" on a turn that never read the lesson — a request that is
			// otherwise pattern-free, on-topic and perfectly well-formed. It does
			// NOT refuse the same request on a turn that did read the lesson; see
			// security.md S13.
			if (turn) turn.grounded = true;

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
