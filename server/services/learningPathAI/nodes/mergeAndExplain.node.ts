import { ChatOpenAI } from "@langchain/openai";
import type { Prisma } from "@/generated/prisma";
import { env } from "@/lib/env";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { quizAttemptRepository } from "@/server/repositories/quizAttempt.repository";
import { LearningPathInvalidError } from "../learningPathAI.errors";
import type { PathState } from "../learningPathAI.state";
import type { LearningPath, PathStep } from "../schemas/learningPath.schema";
import { LearningPathSchema } from "../schemas/learningPath.schema";

type LessonEnrichment = {
	summary: string | null;
	concepts: Prisma.JsonValue;
	glossary: Prisma.JsonValue;
	quizAttempts?: {
		quizId: string;
		isCorrect: boolean;
		selectedAnswer: string;
		attemptedAt: Date;
	}[];
};

async function fetchLessonSummary(lessonId: string): Promise<{
	summary: string | null;
	concepts: Prisma.JsonValue;
	glossary: Prisma.JsonValue;
}> {
	const insights = await lessonInsightsRepository.findByLessonId(lessonId);
	if (insights) {
		return {
			summary: insights.summary,
			concepts: insights.concepts,
			glossary: insights.glossary,
		};
	}
	const lesson = await lessonRepository.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: { description: true },
	});
	return { summary: lesson?.description ?? null, concepts: [], glossary: [] };
}

async function fetchQuizAttemptHistory(
	lessonId: string,
	studentId: string,
): Promise<
	{
		quizId: string;
		isCorrect: boolean;
		selectedAnswer: string;
		attemptedAt: Date;
	}[]
> {
	const attempts = await quizAttemptRepository.findMany({
		where: { studentId, quiz: { lessonId } },
		orderBy: { createdAt: "desc" },
		take: 5,
		select: {
			quizId: true,
			isCorrect: true,
			selectedAnswer: true,
			createdAt: true,
		},
	});
	return attempts.map((a) => ({
		quizId: a.quizId,
		isCorrect: a.isCorrect,
		selectedAnswer: a.selectedAnswer,
		attemptedAt: a.createdAt,
	}));
}

async function gatherEnrichment(
	state: PathState,
): Promise<Map<string, LessonEnrichment>> {
	const retryLessonIds = new Set(
		state.candidateSteps
			.filter((c) => c.type === "RETRY_QUIZ")
			.map((c) => c.lessonId),
	);
	const uniqueLessonIds = [
		...new Set(state.candidateSteps.map((c) => c.lessonId)),
	];

	const enrichment = new Map<string, LessonEnrichment>();

	await Promise.all(
		uniqueLessonIds.map(async (lessonId) => {
			const [summaryData, quizAttempts] = await Promise.all([
				fetchLessonSummary(lessonId),
				retryLessonIds.has(lessonId)
					? fetchQuizAttemptHistory(lessonId, state.studentId)
					: Promise.resolve(undefined),
			]);
			enrichment.set(lessonId, { ...summaryData, quizAttempts });
		}),
	);

	return enrichment;
}

function semanticValidate(
	draft: LearningPath,
	state: PathState,
): string | null {
	const completedSet = new Set(state.completedLessonIds);
	const allLessonIds = new Set(state.lessonOrder.map((l) => l.id));
	const failedQuizIds = new Set(state.failedQuizzes.map((f) => f.quizId));

	for (const step of draft.steps) {
		if (!allLessonIds.has(step.lessonId)) {
			return `lessonId "${step.lessonId}" does not belong to this course`;
		}
		if (step.type === "NEW_LESSON" && completedSet.has(step.lessonId)) {
			return `NEW_LESSON step references completed lessonId "${step.lessonId}"`;
		}
		if (step.type === "REVIEW_LESSON" && !completedSet.has(step.lessonId)) {
			return `REVIEW_LESSON step references non-completed lessonId "${step.lessonId}"`;
		}
		if (step.type === "RETRY_QUIZ") {
			if (!step.quizId) return `RETRY_QUIZ step is missing quizId`;
			if (!failedQuizIds.has(step.quizId)) {
				return `RETRY_QUIZ quizId "${step.quizId}" has no failed attempt for this student`;
			}
		}
	}
	return null;
}

function buildPromptMessages(
	state: PathState,
	enrichment: Map<string, LessonEnrichment>,
	violationFeedback?: string,
) {
	const enrichedCandidates = state.candidateSteps.map((c) => {
		const lessonMeta = state.lessonOrder.find((l) => l.id === c.lessonId);
		const data = enrichment.get(c.lessonId);
		return {
			...c,
			title: lessonMeta?.title ?? c.lessonId,
			concepts: lessonMeta?.concepts ?? [],
			lessonSummary: data?.summary ?? null,
			lessonConcepts: data?.concepts ?? [],
			...(data?.quizAttempts !== undefined
				? { quizAttempts: data.quizAttempts }
				: {}),
		};
	});

	const systemContent = `You are planning a student's next learning steps in a course.
Given candidate actions and weak concepts, produce 3–5 final steps with concrete one-sentence reasons grounded in the student's progress.
Rules:
- NEW_LESSON steps must use a lessonId NOT in completedLessonIds.
- REVIEW_LESSON steps must use a lessonId IN completedLessonIds.
- RETRY_QUIZ steps must include a quizId from failedQuizzes.
- Each reason must be at least 20 characters and reference the student's actual data.
- summary must be at least 20 characters describing the overall recommendation.`;

	const humanContent = `Candidate steps: ${JSON.stringify(enrichedCandidates)}
Weak concepts: ${JSON.stringify(state.weakConcepts)}
Completed lesson IDs: ${JSON.stringify(state.completedLessonIds)}
Failed quiz IDs: ${JSON.stringify(state.failedQuizzes)}
Prior reflection feedback: ${state.reflectionFeedback ?? "none"}${
		violationFeedback ? `\nValidation error to fix: ${violationFeedback}` : ""
	}`;

	return [
		{ role: "system" as const, content: systemContent },
		{ role: "human" as const, content: humanContent },
	];
}

export async function mergeAndExplain(
	state: PathState,
): Promise<Partial<PathState>> {
	if (state.skipLLM) {
		const steps: PathStep[] = state.candidateSteps.slice(0, 3).map((c) => ({
			type: c.type,
			lessonId: c.lessonId,
			quizId: c.quizId ?? null,
			title:
				state.lessonOrder.find((l) => l.id === c.lessonId)?.title ?? c.lessonId,
			reason: c.reasonSeed,
		}));
		return {
			finalSteps: steps,
			generatedWeakConcepts: state.weakConcepts.map((w) => w.concept),
			summary: "Here are your next recommended lessons to get started.",
		};
	}

	const enrichment = await gatherEnrichment(state);

	const llm = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.3,
		apiKey: env.OPENAI_API_KEY,
	}).withStructuredOutput(LearningPathSchema);

	let lastViolation: string | undefined;

	for (let attempt = 0; attempt < 3; attempt++) {
		const messages = buildPromptMessages(state, enrichment, lastViolation);
		const draft = await llm.invoke(messages);
		const violation = semanticValidate(draft, state);
		if (!violation) {
			return {
				finalSteps: draft.steps,
				generatedWeakConcepts: draft.weakConcepts,
				summary: draft.summary,
			};
		}
		lastViolation = violation;
	}

	throw new LearningPathInvalidError(
		"Structured output failed semantic validation after 3 attempts",
		"INTERNAL_SERVER_ERROR",
	);
}
