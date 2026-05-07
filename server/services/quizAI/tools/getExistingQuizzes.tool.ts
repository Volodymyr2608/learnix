import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { quizRepository } from "@/server/repositories/quiz.repository";

export const getExistingQuizzesTool = tool(
	async ({ lessonId }: { lessonId: string }) => {
		const quizzes = await quizRepository.findByLesson(lessonId);

		if (quizzes.length === 0) {
			return "No existing questions for this lesson.";
		}

		return quizzes.map((q) => `- ${q.question}`).join("\n");
	},
	{
		name: "get_existing_quizzes",
		description:
			"Reads existing quiz questions for the lesson so you avoid generating duplicates.",
		schema: z.object({ lessonId: z.string() }),
	},
);
