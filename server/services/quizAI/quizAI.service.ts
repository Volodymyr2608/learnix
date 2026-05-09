import { lessonRepository } from "@/server/repositories/lesson.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { traced } from "@/server/services/_shared/tracing";
import { QuizForbiddenError } from "@/server/services/quiz/quiz.errors";
import { logger } from "@/server/utils/logger";
import { createQuizAgent } from "./quizAI.agent";
import {
	LessonHasNoContentError,
	MaxRetriesExceededError,
} from "./quizAI.errors";
import { validateSemantics } from "./quizAI.validator";
import type { QuizQuestion } from "./schemas/quizOutput.schema";

const MAX_ATTEMPTS = 3;

class QuizAIService {
	async generateForLesson(
		lessonId: string,
		count: number,
		instructorId: string,
		regenerate: boolean,
	): Promise<QuizQuestion[]> {
		const coreGenerate = traced(
			"quizAI.generateForLesson",
			async (
				lId: string,
				n: number,
				regen: boolean,
			): Promise<QuizQuestion[]> => {
				const lesson = await lessonRepository.findFirst({
					where: {
						id: lId,
						deletedAt: null,
						section: { course: { instructorId } },
					},
					select: {
						content: true,
						section: { select: { course: { select: { level: true } } } },
					},
				});

				if (!lesson) {
					throw new QuizForbiddenError(
						"Lesson not found or access denied",
						"FORBIDDEN",
					);
				}

				if (!lesson.content?.trim()) {
					throw new LessonHasNoContentError(lId);
				}

				if (!regen) {
					const existing = await quizRepository.findByLesson(lId);
					if (existing.length > 0) {
						return existing.map((q) => ({
							question: q.question,
							options: q.options as string[],
							correct: q.correct,
						}));
					}
				}

				const level = lesson.section?.course?.level ?? "Intermediate";
				const agent = await createQuizAgent(n, level, regen);

				let hint = "";

				for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
					try {
						const userMessage = hint
							? `Generate ${n} questions for lesson ${lId}. Important correction from previous attempt: ${hint}`
							: `Generate ${n} questions for lesson ${lId}.`;

						const result = await agent.invoke({
							messages: [{ role: "user", content: userMessage }],
						});

						const questions = (
							result.structuredResponse as { questions: QuizQuestion[] }
						).questions;

						const violation = validateSemantics(questions);

						if (!violation) {
							return questions;
						}

						hint = violation;
						logger.warn(
							`Quiz generation attempt ${attempt + 1} failed validation: ${violation}`,
						);
					} catch (error) {
						logger.warn(
							`Quiz generation attempt ${attempt + 1} threw error:`,
							error,
						);
						hint = error instanceof Error ? error.message : "Unknown error";
					}
				}

				throw new MaxRetriesExceededError(lId);
			},
			{ feature: "quiz", userId: instructorId, model: "gpt-4o-mini" },
		);

		return coreGenerate(lessonId, count, regenerate);
	}
}

export const quizAIService = new QuizAIService();
