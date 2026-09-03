import { lessonRepository } from "@/server/repositories/lesson.repository";
import { parseStoredConcepts } from "@/server/repositories/lessonInsights.conceptsSchema";
import { quizRepository } from "@/server/repositories/quiz.repository";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import {
	aiMetricsHandler,
	turnOutcomeOf,
} from "@/server/services/_shared/aiMetrics/handler";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import { retagWithAllowlist } from "@/server/services/_shared/concepts/conceptKey";
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
		// One handler for the whole generation, not one per attempt: the three
		// retries are the same turn, and their amplification is exactly what the
		// summary should make countable.
		const metrics = aiMetricsHandler({
			feature: "quizAI",
			userId: instructorId,
		});

		const coreGenerate = traced(
			"quizAI.generateForLesson",
			async (
				lId: string,
				n: number,
				regen: boolean,
			): Promise<QuizQuestion[]> => {
				// The query that authorizes is the query that reads the allowlist: the
				// concepts come back on the row the ownership check returned, so the
				// tag can never be resolved against a lesson the caller does not own.
				// Re-reading them by the request's `lessonId` afterwards would be the
				// same identifier travelling a second, unauthorized path.
				const lesson = await lessonRepository.findFirst({
					where: {
						id: lId,
						deletedAt: null,
						section: { course: { instructorId } },
					},
					select: {
						content: true,
						section: { select: { course: { select: { level: true } } } },
						lessonInsights: { select: { concepts: true } },
					},
				});

				if (!lesson) {
					throw new QuizForbiddenError(
						"Lesson not found or access denied",
						"FORBIDDEN",
					);
				}

				const allowlist = parseStoredConcepts(lesson.lessonInsights?.concepts, {
					lessonId: lId,
				}).map((c) => c.name);

				if (!lesson.content?.trim()) {
					throw new LessonHasNoContentError(lId);
				}

				if (!regen) {
					// The author's accessor: this path returns the questions to the
					// instructor who owns the lesson, verified above, and the dialog
					// they land in needs the key it is about to save.
					const existing = await quizRepository.findByLessonForAuthor(lId);
					if (existing.length > 0) {
						return existing.map((q) => ({
							question: q.question,
							options: q.options as string[],
							correct: q.correct,
							concept: q.concept,
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

						const result = await agent.invoke(
							{ messages: [{ role: "user", content: userMessage }] },
							{ callbacks: [metrics] },
						);

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
							// One spelling of "untagged" on both return paths.
							// `retagWithAllowlist` drops the key, the stored column
							// yields null, and the schema declares it required and
							// nullable — so the caller never has to test for both.
							return retagWithAllowlist(questions, allowlist).map((q) => ({
								...q,
								concept: q.concept ?? null,
							}));
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

		// The turn ends here however it ends — a summary in a `finally` is what
		// keeps a failed or abandoned generation inside the denominator.
		try {
			return await coreGenerate(lessonId, count, regenerate);
		} catch (error) {
			metrics.emitSummary(turnOutcomeOf(error));
			throw error;
		} finally {
			metrics.emitSummary("ok");
		}
	}
}

export const quizAIService = new QuizAIService();
