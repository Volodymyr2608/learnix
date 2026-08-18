import { ChatOpenAI } from "@langchain/openai";
import type { Prisma } from "@/generated/prisma";
import { env } from "@/lib/env";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { quizAttemptRepository } from "@/server/repositories/quizAttempt.repository";
import { UNTRUSTED_DATA_CLAUSE } from "@/server/services/_shared/aiGuard/messages";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
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

export type SemanticViolationCode =
	| "duplicate_lesson_id"
	| "lesson_not_in_course"
	| "new_lesson_completed"
	| "review_lesson_not_completed"
	| "missing_quiz_id"
	| "quiz_not_failed";

export type SemanticViolation = {
	code: SemanticViolationCode;
	stepIndex: number;
};

/**
 * The retry prompt's correction sentence, keyed on a code. Fixed server text and
 * an integer position — never the offending id, which the model authored and
 * which used to travel back into the next attempt's prompt verbatim.
 */
const VIOLATION_SENTENCES: Record<SemanticViolationCode, string> = {
	duplicate_lesson_id:
		"repeats a lesson already used by an earlier step; every step must reference a different lesson.",
	lesson_not_in_course:
		"references a lesson that is not part of this course; use only the candidate lessons provided.",
	new_lesson_completed:
		"is a NEW_LESSON for a lesson the student has already completed; use REVIEW_LESSON instead.",
	review_lesson_not_completed:
		"is a REVIEW_LESSON for a lesson the student has not completed; use NEW_LESSON instead.",
	missing_quiz_id:
		"is a RETRY_QUIZ without a quizId; every RETRY_QUIZ step needs one from the failed quizzes.",
	quiz_not_failed:
		"is a RETRY_QUIZ for a quiz the student has not failed; use only quizIds from failedQuizzes.",
};

export const violationFeedback = (violation: SemanticViolation): string =>
	`Step ${violation.stepIndex + 1} ${VIOLATION_SENTENCES[violation.code]}`;

export function semanticValidate(
	draft: LearningPath,
	state: PathState,
): SemanticViolation | null {
	const completedSet = new Set(state.completedLessonIds);
	const allLessonIds = new Set(state.lessonOrder.map((l) => l.id));
	const failedQuizIds = new Set(state.failedQuizzes.map((f) => f.quizId));
	const seenLessonIds = new Set<string>();

	for (const [stepIndex, step] of draft.steps.entries()) {
		if (seenLessonIds.has(step.lessonId)) {
			return { code: "duplicate_lesson_id", stepIndex };
		}
		seenLessonIds.add(step.lessonId);

		if (!allLessonIds.has(step.lessonId)) {
			return { code: "lesson_not_in_course", stepIndex };
		}
		if (step.type === "NEW_LESSON" && completedSet.has(step.lessonId)) {
			return { code: "new_lesson_completed", stepIndex };
		}
		if (step.type === "REVIEW_LESSON" && !completedSet.has(step.lessonId)) {
			return { code: "review_lesson_not_completed", stepIndex };
		}
		if (step.type === "RETRY_QUIZ") {
			if (!step.quizId) return { code: "missing_quiz_id", stepIndex };
			if (!failedQuizIds.has(step.quizId)) {
				return { code: "quiz_not_failed", stepIndex };
			}
		}
	}
	return null;
}

function buildPromptMessages(
	state: PathState,
	enrichment: Map<string, LessonEnrichment>,
	violation?: SemanticViolation,
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
- summary must be at least 20 characters describing the overall recommendation.

${UNTRUSTED_DATA_CLAUSE}`;

	const humanContent = `Candidate steps: ${wrapUntrustedContent(
		JSON.stringify(enrichedCandidates),
		"path_candidates",
	)}
Weak concepts: ${wrapUntrustedContent(
		JSON.stringify(state.weakConcepts),
		"lesson_summary",
	)}
Completed lesson IDs: ${JSON.stringify(state.completedLessonIds)}
Failed quiz IDs: ${JSON.stringify(state.failedQuizzes)}
Prior reflection feedback: ${
		state.reflectionFeedback
			? wrapUntrustedContent(state.reflectionFeedback, "model_output")
			: "none"
	}${
		violation
			? `\nValidation error to fix: ${violationFeedback(violation)}`
			: ""
	}`;

	return [
		{ role: "system" as const, content: systemContent },
		{ role: "human" as const, content: humanContent },
	];
}

/**
 * Purpose: turns candidate steps into the final path plus a summary — deterministically when
 * skipLLM is set, otherwise via a structured model call re-validated up to 3 times.
 * Reads: skipLLM, candidateSteps, weakConcepts, lessonOrder, completedLessonIds, failedQuizzes,
 * reflectionFeedback, studentId (for enrichment lookups).
 * Writes: finalSteps, generatedWeakConcepts, summary.
 * Fails: throws LearningPathInvalidError after 3 failed semantic validations; database lookups
 * during enrichment propagate unguarded.
 */
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

	let lastViolation: SemanticViolation | undefined;

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
