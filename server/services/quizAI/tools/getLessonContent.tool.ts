import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lessonRepository } from "@/server/repositories/lesson.repository";

export const getLessonContentTool = tool(
	async ({ lessonId }: { lessonId: string }) => {
		const lesson = await lessonRepository.findFirst({
			where: { id: lessonId, deletedAt: null },
			select: { title: true, content: true },
		});

		if (!lesson?.content) {
			return "No text content found for this lesson.";
		}

		return `Title: ${lesson.title}\n\n${lesson.content}`;
	},
	{
		name: "get_lesson_content",
		description:
			"Reads the lesson title and content to understand what questions to generate.",
		schema: z.object({ lessonId: z.string() }),
	},
);
