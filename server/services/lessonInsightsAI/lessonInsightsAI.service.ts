import type { Prisma } from "@/generated/prisma";
import { lessonRepository } from "@/server/repositories/lesson.repository";
import { lessonInsightsRepository } from "@/server/repositories/lessonInsights.repository";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import {
	aiMetricsHandler,
	turnOutcomeOf,
} from "@/server/services/_shared/aiMetrics/handler";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import { traced } from "@/server/services/_shared/tracing";
import { insightsChain } from "./chains/parallel.chain";
import { lessonContentHash } from "./contentHash";
import {
	LessonHasNoContentError,
	NotInstructorError,
} from "./lessonInsightsAI.errors";

const MODEL = "gpt-4o-mini";

/**
 * Runs the shared output boundary over every model-authored field this surface
 * persists — the summary, each concept's name and explanation, each glossary
 * term and definition — and REPORTS without blocking.
 *
 * Report-only is decision D-M, taken on a measurement rather than a hunch: the
 * aiOutput:falsePositive eval put this surface at 9.5%, all of it
 * untrusted_data_echo, and almost all of it from lessons that legitimately
 * discuss the wrapper tag. A generation rejected here produces no visible error
 * for the instructor to act on — it simply yields no study guide — so at that
 * rate failing closed costs more than the disclosure it prevents.
 *
 * Rejection would be whole-generation, never per entry: GlossarySchema permits
 * an empty list, so dropping one entry is silent degradation on a control whose
 * baseline is zero.
 *
 * The event is emitted (emit is not false) because detection is the whole point
 * of report-only. Enforcement here is a follow-up gated on bringing the number
 * down, tracked as residual 7a in security.md.
 */
const reportModelText = (
	result: {
		summary: { summary: string };
		concepts: { concepts: { name: string; explanation: string }[] };
		glossary: { glossary: { term: string; definition: string }[] };
	},
	ctx: { lessonId: string; userId: string },
): void => {
	const modelText = [
		result.summary.summary,
		...result.concepts.concepts.flatMap((c) => [c.name, c.explanation]),
		...result.glossary.glossary.flatMap((g) => [g.term, g.definition]),
	];

	for (const text of modelText) {
		const verdict = validateModelText(text ?? "", {
			feature: "lessonInsightsAI",
			userId: ctx.userId,
			// The instructor triggering generation is the operator; the lesson is
			// where the content that steered the model came from.
			subject: { kind: "lesson", id: ctx.lessonId },
		});
		// One event per rejected turn, not one per field: the first hit is the
		// signal, and the rest would be the same finding repeated.
		if (!verdict.valid) return;
	}
};

class LessonInsightsAIService {
	async generateForLesson(lessonId: string, instructorId: string) {
		const metrics = aiMetricsHandler({ feature: "lessonInsightsAI" });

		const coreGenerate = traced(
			"lessonInsightsAI.generateForLesson",
			async (lId: string) => {
				const lesson = await lessonRepository.findFirst({
					where: {
						id: lId,
						deletedAt: null,
						section: { course: { instructorId } },
					},
					select: { id: true, content: true },
				});

				if (!lesson) throw new NotInstructorError(lId);
				if (!lesson.content?.trim()) throw new LessonHasNoContentError(lId);

				const contentHash = lessonContentHash(lesson.content);

				const existing = await lessonInsightsRepository.findByLessonId(lId);
				// A matching hash alone is not enough to serve the cached row: the
				// read boundary turns a malformed `concepts` value into [], so a
				// poisoned or truncated row would otherwise short-circuit its own
				// replacement forever — the hash still matches, and every later call
				// returns the same empty list. An empty array on a lesson that has
				// content is treated as a miss, and regeneration heals the row.
				const cacheIsUsable =
					existing?.contentHash === contentHash && existing.concepts.length > 0;
				if (cacheIsUsable) return existing;

				const result = await insightsChain.invoke(
					{ content: wrapUntrustedContent(lesson.content, "lesson_content") },
					{ callbacks: [metrics] },
				);

				reportModelText(result, { lessonId: lId, userId: instructorId });

				return lessonInsightsRepository.upsertByLessonId(lId, {
					summary: result.summary.summary,
					concepts: result.concepts
						.concepts as unknown as Prisma.InputJsonValue,
					glossary: result.glossary
						.glossary as unknown as Prisma.InputJsonValue,
					model: MODEL,
					contentHash,
				});
			},
			{ feature: "summary", userId: instructorId, model: MODEL },
		);

		// The turn ends here however it ends — a summary in a `finally` is what
		// keeps a failed or abandoned generation inside the denominator.
		try {
			return await coreGenerate(lessonId);
		} catch (error) {
			metrics.emitSummary(turnOutcomeOf(error));
			throw error;
		} finally {
			metrics.emitSummary("ok");
		}
	}

	async getForLesson(lessonId: string, userId: string) {
		const lesson = await lessonRepository.findFirst({
			where: {
				id: lessonId,
				deletedAt: null,
				OR: [
					{ section: { course: { instructorId: userId } } },
					{
						section: {
							course: {
								enrollments: {
									some: { studentId: userId, status: { not: "cancelled" } },
								},
							},
						},
					},
				],
			},
			select: { id: true, content: true },
		});

		if (!lesson) return null;

		const insights = await lessonInsightsRepository.findByLessonId(lessonId);
		if (!insights) return null;

		/**
		 * Whether regenerating would actually do anything. `generateForLesson`
		 * short-circuits on a matching hash and returns the stored row without
		 * calling the model, so on unchanged content the Regenerate button was
		 * reporting success for work it never did.
		 *
		 * The comparison belongs here rather than in the client: the client cannot
		 * see the lesson text the hash was taken over, and the toolbar's
		 * `lastSavedAt` heuristic only knows about saves in the current session —
		 * it is blind to a lesson edited yesterday and reloaded today.
		 *
		 * The empty-concepts case mirrors the generate side exactly: a row whose
		 * concepts did not survive the read boundary is a cache MISS there, so it
		 * must not read as up to date here, or the one button that could heal the
		 * row would be the one disabled.
		 */
		const matchesCurrentContent =
			insights.contentHash === lessonContentHash(lesson.content ?? "") &&
			insights.concepts.length > 0;

		return { ...insights, matchesCurrentContent };
	}
}

export const lessonInsightsAIService = new LessonInsightsAIService();
