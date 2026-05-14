import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";

export const buildGetLessonSummaryTool = () =>
	tool(
		async ({ lessonId }: { lessonId: string }) => {
			const insights = await lessonInsightsRepository.findByLessonId(lessonId);
			if (insights) {
				return JSON.stringify({
					summary: insights.summary,
					concepts: insights.concepts,
					glossary: insights.glossary,
				});
			}
			const lesson = await lessonRepository.findFirst({
				where: { id: lessonId, deletedAt: null },
				select: { description: true },
			});
			return JSON.stringify({
				summary:
					(lesson as { description: string | null } | null)?.description ??
					null,
				concepts: [],
				glossary: [],
			});
		},
		{
			name: "get_lesson_summary",
			description:
				"Returns the LessonInsights summary, concepts, and glossary for a lesson. Falls back to lesson.description if insights are missing.",
			schema: z.object({ lessonId: z.string() }),
		},
	);
