import { z } from "zod";

export const QuizQuestionSchema = z.object({
	question: z.string().min(1),
	options: z.array(z.string().min(1)).length(4),
	correct: z.string().min(1),
	/**
	 * Which lesson concept this question tests. The model PROPOSES a name; the
	 * service resolves it against the lesson's insights allowlist and replaces it
	 * with the allowlist's spelling, or drops it. Nothing the model writes here
	 * reaches the column unchecked — the value decides which concept a pass
	 * promotes, so it is authority, not description.
	 */
	concept: z.string().max(200).optional(),
});

export const QuizOutputSchema = z.object({
	questions: z.array(QuizQuestionSchema).min(3).max(5),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizOutput = z.infer<typeof QuizOutputSchema>;
