import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";

/** Same closure-bound id as get_lesson_content — see that file for why. */
export const buildGetExistingQuizzesTool = (lessonId: string) =>
	tool(
		async () => {
			const quizzes = await quizRepository.findByLesson(lessonId);

			if (quizzes.length === 0) {
				return "No existing questions for this lesson.";
			}

			// Existing questions are instructor-authored (or authored by an earlier
			// generation from instructor content), so they are untrusted as well.
			return wrapUntrustedContent(
				quizzes.map((q) => `- ${q.question}`).join("\n"),
				"lesson_content",
			);
		},
		{
			name: "get_existing_quizzes",
			description:
				"Reads existing quiz questions for the lesson being worked on so you avoid duplicates.",
			schema: z.object({}),
		},
	);