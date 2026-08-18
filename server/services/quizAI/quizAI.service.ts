import { lessonRepository } from "@/server/repositories/lesson.repository";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import { traced } from "@/server/services/_shared/tracing";
import { QuizForbiddenError } from "@/server/services/quiz/quiz.errors";
import { logger } from "@/server/utils/logger";
import { createQuizAgent } from "./quizAI.agent";
import {
	LessonHasNoContentError,
	MaxRetriesExceededError,
} from "./quizAI.errors";
import { validateSemantics } from "./quizAI.validator";
import type { QuizQuestion } from "./schemas/quizOutput.schema";

const MAX_ATTEMPTS = 3;

/**
 * Runs the shared output boundary over every model-authored field a quiz
 * persists — each question, its four options and the correct answer — and
 * REPORTS without blocking.
 *
 * Report-only is decision D-M: the aiOutput:falsePositive eval measured 11.1%
 * on this surface, all of it untrusted_data_echo, and nearly all of it from
 * lessons that legitimately discuss the wrapper tag. A rejection here would burn
 * a retry attempt and, at that rate, deny instructors quizzes on exactly the
 * lessons this platform teaches.
 *
 * Deliberately does NOT feed the verdict back as a retry hint. That loop would
 * be a hill-climbing oracle built out of the boundary itself: the caller authors
 * the lesson body, so a per-attempt yes/no would let them tune text until it
 * passes.
 */
const reportModelText = (
	questions: QuizQuestion[],
	ctx: { lessonId: string; userId: string },
): boolean => {
	const modelText = questions.flatMap((q) => [
		q.question,
		...(q.options ?? []),
		q.correct,
	]);

	for (const text of modelText) {
		const verdict = validateModelText(text ?? "", {
			feature: "quizAI",
			userId: ctx.userId,
			subject: { kind: "lesson", id: ctx.lessonId },
		});
		// One event per generation, not one per field — and the caller uses the
		// return value to keep it one per generation rather than one per attempt.
		if (!verdict.valid) return true;
	}
	return false;
};

class QuizAIService {
	async generateForLesson(
		lessonId: string,
		count: number,
		instructorId: string,
		regenerate: boolean,
	): Promise<QuizQuestion[]> {
		const coreGenerate = traced(
			"quizAI.generateForLesson",
			async (
				lId: string,
				n: number,
				regen: boolean,
			): Promise<QuizQuestion[]> => {
				const lesson = await lessonRepository.findFirst({
					where: {
						id: lId,
						deletedAt: null,
						section: { course: { instructorId } },
					},
					select: {
						content: true,
						section: { select: { course: { select: { level: true } } } },
					},
				});

				if (!lesson) {
					throw new QuizForbiddenError(
						"Lesson not found or access denied",
						"FORBIDDEN",
					);
				}

				if (!lesson.content?.trim()) {
					throw new LessonHasNoContentError(lId);
				}

				if (!regen) {
					const existing = await quizRepository.findByLesson(lId);
					if (existing.length > 0) {
						return existing.map((q) => ({
							question: q.question,
							options: q.options as string[],
							correct: q.correct,
						}));
					}
				}

				const level = lesson.section?.course?.level ?? "Intermediate";
				const agent = await createQuizAgent(n, level, regen, lId);

				let hint = "";
				// One boundary event per GENERATION. reportModelText sits inside the
				// retry loop, so without this a generation that trips a rule and then
				// fails semantic validation twice emits three identical events —
				// inflating exactly the count a threshold would read.
				let reported = false;

				for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
					try {
						// The lesson id is deliberately absent: the tools are already
						// bound to it, and naming it here would hand the model an
						// identifier it has no legitimate use for.
						const userMessage = hint
							? `Generate ${n} questions for this lesson. Important correction from previous attempt: ${hint}`
							: `Generate ${n} questions for this lesson.`;

						const result = await agent.invoke({
							messages: [{ role: "user", content: userMessage }],
						});

						const questions = (
							result.structuredResponse as { questions: QuizQuestion[] }
						).questions;

						if (!reported) {
							reported = reportModelText(questions, {
								lessonId: lId,
								userId: instructorId,
							});
						}

						const violation = validateSemantics(questions);

						if (!violation) {
							return questions;
						}

						hint = violation;
						logger.warn(
							`Quiz generation attempt ${attempt + 1} failed validation: ${violation}`,
						);
					} catch (error) {
						// C7: the exception message must NOT become the next attempt's
						// hint. It is not a validator message — it can carry provider
						// text, a stack fragment, or content read from the lesson — and
						// feeding it back puts unauthored text into the prompt through
						// the error path. Retry with no hint; the log keeps the detail.
						logger.warn(
							`Quiz generation attempt ${attempt + 1} threw error:`,
							error,
						);
						hint = "";
					}
				}

				// Declared fail-open: three attempts produced nothing usable, and the
				// caller gets a neutral error. Without the event, a model being steered
				// into repeated invalid output is indistinguishable from a flaky
				// provider.
				logSecurityEvent({
					feature: "quizAI",
					userId: instructorId,
					layer: "model_call_fallback",
					outcome: "fallback_triggered",
					ruleIds: ["max_attempts_exceeded"],
					score: 0,
					subject: { kind: "lesson", id: lId },
				});

				throw new MaxRetriesExceededError(lId);
			},
			{ feature: "quiz", userId: instructorId, model: "gpt-4o-mini" },
		);

		return coreGenerate(lessonId, count, regenerate);
	}
}

export const quizAIService = new QuizAIService();
