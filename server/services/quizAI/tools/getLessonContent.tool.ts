import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";

/**
 * The lesson id is bound at agent-construction time, from the lesson whose
 * ownership quizAI.service already proved. It is deliberately not a tool
 * argument: an id the model can name is an id an injected instruction can
 * change, and this tool reads lesson content with no ownership filter of its own.
 */
export const buildGetLessonContentTool = (lessonId: string) =>
	tool(
		async () => {
			const lesson = await lessonRepository.findFirst({
				where: { id: lessonId, deletedAt: null },
				select: { title: true, content: true },
			});

			if (!lesson?.content) {
				return "No text content found for this lesson.";
			}

			return wrapUntrustedContent(
				`Title: ${lesson.title}\n\n${lesson.content}`,
				"lesson_content",
			);
		},
		{
			name: "get_lesson_content",
			description:
				"Reads the title and content of the lesson being worked on, to understand what questions to generate.",
			schema: z.object({}),
		},
	);