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
	/**
	 * What the student has actually done with this concept, rather than a number
	 * on a scale nobody outside this codebase shares.
	 *
	 * `encountered` is DERIVED at read time — the concept appears in a lesson the
	 * student completed, and no mastery row exists for it. It is not stored,
	 * because "has seen a lesson mentioning X" is not evidence about X, and
	 * storing it made "has mastery" and "has been exposed" the same query.
	 * `applied` means a row exists at the conversation ceiling: the student
	 * answered a check about it.
	 */
	evidence: z.enum(["encountered", "applied"]),
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
