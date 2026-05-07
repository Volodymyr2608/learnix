import { z } from "zod";
import { QuizSchema } from "@/prisma/zod";

export const QuizSubmitDto = z.object({
	quizId: QuizSchema.shape.id,
	selectedAnswer: z.string().min(1),
});

export type QuizSubmitDto = z.infer<typeof QuizSubmitDto>;

export const QuizItemDto = z.object({
	question: z.string().min(1, "Question is required"),
	options: z.array(z.string().min(1)).length(4, "Exactly 4 options required"),
	correct: z.string().min(1, "Correct answer is required"),
});

export type QuizItemDto = z.infer<typeof QuizItemDto>;

export const QuizUpsertManyDto = z.object({
	lessonId: QuizSchema.shape.lessonId,
	questions: z.array(QuizItemDto),
});

export type QuizUpsertManyDto = z.infer<typeof QuizUpsertManyDto>;
