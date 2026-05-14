import { Annotation } from "@langchain/langgraph";
import type { PathStep } from "./schemas/learningPath.schema";

export type LessonOrderRow = {
	id: string;
	title: string;
	sectionOrder: number;
	lessonOrder: number;
	concepts: string[];
};

export type QuizAttemptRow = {
	quizId: string;
	lessonId: string;
	isCorrect: boolean;
	attemptedAt: Date;
};

export type MasteryRow = {
	concept: string;
	level: number;
};

export type WeakConceptRow = {
	concept: string;
	level: number;
	firstLessonId: string;
};

export type FailedQuizRow = {
	lessonId: string;
	quizId: string;
};

export type DraftStep = {
	type: "NEW_LESSON" | "REVIEW_LESSON" | "RETRY_QUIZ";
	lessonId: string;
	quizId?: string;
	reasonSeed: string;
};

export const PathStateAnnotation = Annotation.Root({
	studentId: Annotation<string>(),
	courseId: Annotation<string>(),
	skipLLM: Annotation<boolean>({ default: () => false, reducer: (_, b) => b }),
	completedLessonIds: Annotation<string[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	lessonOrder: Annotation<LessonOrderRow[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	quizAttempts: Annotation<QuizAttemptRow[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	mastery: Annotation<MasteryRow[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	weakConcepts: Annotation<WeakConceptRow[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	failedQuizzes: Annotation<FailedQuizRow[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	candidateSteps: Annotation<DraftStep[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	finalSteps: Annotation<PathStep[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	generatedWeakConcepts: Annotation<string[]>({
		default: () => [],
		reducer: (_, b) => b,
	}),
	summary: Annotation<string>({ default: () => "", reducer: (_, b) => b }),
	reflectionAttempt: Annotation<number>({
		default: () => 0,
		reducer: (_, b) => b,
	}),
	reflectionFeedback: Annotation<string | undefined>({
		default: () => undefined,
		reducer: (_, b) => b,
	}),
});

export type PathState = typeof PathStateAnnotation.State;
