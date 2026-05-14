import { ChatOpenAI } from "@langchain/openai";
import { env } from "@/lib/env";
import { LearningPathSchema } from "../schemas/learningPath.schema";
import type { LearningPath, PathStep } from "../schemas/learningPath.schema";
import { LearningPathInvalidError } from "../learningPathAI.errors";
import type { PathState } from "../learningPathAI.state";

function semanticValidate(draft: LearningPath, state: PathState): string | null {
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

function buildPromptMessages(state: PathState, violationFeedback?: string) {
	const enrichedCandidates = state.candidateSteps.map((c) => ({
		...c,
		title: state.lessonOrder.find((l) => l.id === c.lessonId)?.title ?? c.lessonId,
		concepts: state.lessonOrder.find((l) => l.id === c.lessonId)?.concepts ?? [],
	}));

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
			quizId: c.quizId,
			title:
				state.lessonOrder.find((l) => l.id === c.lessonId)?.title ?? c.lessonId,
			reason: c.reasonSeed,
		}));
		return {
			finalSteps: steps,
			summary: "Here are your next recommended lessons to get started.",
		};
	}

	const llm = new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature: 0.3,
		apiKey: env.OPENAI_API_KEY,
	}).withStructuredOutput(LearningPathSchema);

	let lastViolation: string | undefined;

	for (let attempt = 0; attempt < 3; attempt++) {
		const messages = buildPromptMessages(state, lastViolation);
		const draft = await llm.invoke(messages);
		const violation = semanticValidate(draft, state);
		if (!violation) {
			return { finalSteps: draft.steps, summary: draft.summary };
		}
		lastViolation = violation;
	}

	throw new LearningPathInvalidError(
		"Structured output failed semantic validation after 3 attempts",
		"INTERNAL_SERVER_ERROR",
	);
}