import { z } from "zod";

export const PathStepSchema = z.object({
	type: z.enum(["NEW_LESSON", "REVIEW_LESSON", "RETRY_QUIZ"]),
	lessonId: z.string(),
	quizId: z.string().nullable(),
	title: z.string(),
	reason: z.string().min(20),
});

export const LearningPathSchema = z.object({
	steps: z.array(PathStepSchema).min(1).max(5),
	summary: z.string().min(20),
	weakConcepts: z.array(z.string()).max(8),
});

export type PathStep = z.infer<typeof PathStepSchema>;
export type LearningPath = z.infer<typeof LearningPathSchema>;
