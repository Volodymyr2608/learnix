import { z } from "zod";

export const QuizQuestionSchema = z.object({
	question: z.string().min(1),
	options: z.array(z.string().min(1)).length(4),
	correct: z.string().min(1),
});

export const QuizOutputSchema = z.object({
	questions: z.array(QuizQuestionSchema).min(3).max(5),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizOutput = z.infer<typeof QuizOutputSchema>;
