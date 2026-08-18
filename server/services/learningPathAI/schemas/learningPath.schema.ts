import { z } from "zod";

export const PathStepSchema = z.object({
	type: z.enum(["NEW_LESSON", "REVIEW_LESSON", "RETRY_QUIZ"]),
	// Bounded because these ids are model-authored: an unbounded string is a
	// channel for carrying prose back into the retry prompt. A cuid is ~25 chars.
	lessonId: z.string().max(64),
	quizId: z.string().max(64).nullable(),
	// Model-authored, persisted and rendered to the student — bounded for the
	// same reason StoredConceptSchema bounds a concept name.
	title: z.string().max(200),
	reason: z.string().min(20).max(2000),
});

export const LearningPathSchema = z.object({
	steps: z.array(PathStepSchema).min(1).max(5),
	summary: z.string().min(20).max(2000),
	weakConcepts: z.array(z.string()).max(8),
});

export type PathStep = z.infer<typeof PathStepSchema>;
export type LearningPath = z.infer<typeof LearningPathSchema>;
