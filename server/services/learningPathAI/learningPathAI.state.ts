import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { PathStepSchema } from "./schemas/learningPath.schema";

const LessonOrderRowSchema = z.object({
	id: z.string(),
	title: z.string(),
	sectionOrder: z.number(),
	lessonOrder: z.number(),
	concepts: z.array(z.string()),
});

const QuizAttemptRowSchema = z.object({
	quizId: z.string(),
	lessonId: z.string(),
	isCorrect: z.boolean(),
	attemptedAt: z.date(),
});

const MasteryRowSchema = z.object({
	concept: z.string(),
	level: z.number(),
});

const WeakConceptRowSchema = z.object({
	concept: z.string(),
	level: z.number(),
	firstLessonId: z.string(),
});

const FailedQuizRowSchema = z.object({
	lessonId: z.string(),
	quizId: z.string(),
});

const DraftStepSchema = z.object({
	type: z.enum(["NEW_LESSON", "REVIEW_LESSON", "RETRY_QUIZ"]),
	lessonId: z.string(),
	quizId: z.string().optional(),
	reasonSeed: z.string(),
});

export const PathStateSchema = new StateSchema({
	studentId: z.string(),
	courseId: z.string(),
	skipLLM: z.boolean().default(false),
	completedLessonIds: z.array(z.string()).default([]),
	lessonOrder: z.array(LessonOrderRowSchema).default([]),
	quizAttempts: z.array(QuizAttemptRowSchema).default([]),
	mastery: z.array(MasteryRowSchema).default([]),
	weakConcepts: z.array(WeakConceptRowSchema).default([]),
	failedQuizzes: z.array(FailedQuizRowSchema).default([]),
	candidateSteps: z.array(DraftStepSchema).default([]),
	finalSteps: z.array(PathStepSchema).default([]),
	generatedWeakConcepts: z.array(z.string()).default([]),
	summary: z.string().default(""),
	reflectionAttempt: z.number().int().default(0),
	reflectionFeedback: z.string().optional(),
});

export type LessonOrderRow = z.infer<typeof LessonOrderRowSchema>;
export type QuizAttemptRow = z.infer<typeof QuizAttemptRowSchema>;
export type MasteryRow = z.infer<typeof MasteryRowSchema>;
export type WeakConceptRow = z.infer<typeof WeakConceptRowSchema>;
export type FailedQuizRow = z.infer<typeof FailedQuizRowSchema>;
export type DraftStep = z.infer<typeof DraftStepSchema>;
export type PathState = typeof PathStateSchema.State;
