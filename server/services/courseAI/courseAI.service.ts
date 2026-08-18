import { type CourseGeneration, DraftStep } from "@/generated/prisma";
import { courseGenerationRepository } from "@/server/repositories/courseGeneration.repository";
import { courseGenerationMessageRepository } from "@/server/repositories/courseGenerationMessage.repository";
import {
	GRAPH_RECURSION_LIMIT,
	withTurnDeadline,
} from "@/server/services/_shared/aiLimits/modelDefaults";
import { traced } from "@/server/services/_shared/tracing";
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { courseBuilderGraph } from "@/server/services/courseAI/graph/graph";
import type { CourseBuilderStateT } from "@/server/services/courseAI/graph/state";
import {
	isMessageShape,
	type MessageShape,
} from "@/server/services/courseAI/guards/isMessageShape";
import { logger } from "@/server/utils/logger";

const HISTORY_LIMIT = 4;

export class CourseAIService {
	async getOrCreateCourseGeneration({
		courseGenerationId,
		userId,
	}: {
		courseGenerationId?: string;
		userId: string;
	}) {
		try {
			if (courseGenerationId) {
				const existing = await courseGenerationRepository.findFirst({
					where: { id: courseGenerationId, instructorId: userId },
				});
				if (existing) return existing;
			}
			return courseGenerationRepository.create({
				instructor: { connect: { id: userId } },
				step: DraftStep.basic,
				content: {},
				status: "active",
			});
		} catch (error) {
			logger.error(error);
			throw new CourseAIError(
				"[Course AI service] failed to create course generation",
			);
		}
	}

	/**
	 * `contextEligible: false` keeps a turn in the thread for the UI while
	 * excluding it from every later prompt. The caller sets it on the user turn
	 * that elicited a retracted reply.
	 *
	 * Ownership is discharged upstream: this is a create bound to a generationId
	 * that already proved ownership in getOrCreateCourseGeneration, which filters
	 * { id, instructorId } and creates fresh on a non-match. What that shape does
	 * NOT buy — unlike the tutor's updateMany — is tolerance of a vanished row: a
	 * create against a deleted generationId raises P2003. The route's `finally`
	 * swallows it through `.catch(logger.error)`; removing that catch would break
	 * the ordering guarantee that the retraction always reaches the client.
	 */
	async saveMessage(generationId: string, message: MessageShape) {
		try {
			return await courseGenerationMessageRepository.create({
				generationId,
				role: message.role,
				content: message.content,
				step: message.step,
				...(message.contextEligible === false
					? { contextEligible: false }
					: {}),
			});
		} catch (e) {
			logger.error(e);
			throw new CourseAIError("[Course AI service] Error saving message");
		}
	}

	private async hydrateState(args: {
		courseGeneration: CourseGeneration;
		userMessage: string;
		mode: "chat" | "finalize";
	}): Promise<CourseBuilderStateT> {
		const { courseGeneration: gen, userMessage, mode } = args;

		// Turns whose reply was retracted stay in the thread but never return to
		// the model. Nothing marks the ASSISTANT row ineligible, which is safe only
		// because a rejected reply is never persisted at all — a later "keep
		// rejected replies for audit" change would silently reintroduce the replay.
		const lastMessages = await courseGenerationMessageRepository.findMany({
			where: { generationId: gen.id, contextEligible: true },
			orderBy: { createdAt: "desc" },
			take: HISTORY_LIMIT,
		});

		const history = lastMessages
			.reverse()
			.filter(isMessageShape)
			.map((m) => ({ role: m.role, content: m.content, step: m.step }));

		return {
			generationId: gen.id,
			instructorId: gen.instructorId,
			currentStep: gen.step,
			content: (gen.content as Record<string, unknown>) ?? {},
			history,
			mode,
			userMessage,
			intent: null,
			reviseTarget: null,
			toolCalls: [],
			pendingToolCalls: [],
			messages: [],
			assessReady: false,
			assessClarify: null,
			draftStepData: undefined,
			confidence: 0,
			shouldAutoAdvance: false,
			assistantText: "",
			validationErrors: null,
			outputRejected: false,
		};
	}

	async runChat({
		courseGeneration,
		userMessage,
		signal,
	}: {
		courseGeneration: CourseGeneration;
		userMessage: string;
		signal?: AbortSignal;
	}) {
		const initialState = await this.hydrateState({
			courseGeneration,
			userMessage,
			mode: "chat",
		});
		const run = traced(
			"courseAI.graph",
			async () =>
				courseBuilderGraph.streamEvents(initialState, {
					version: "v2",
					// MODEL_TIMEOUT_MS bounds one CALL; this bounds the TURN. A chained
					// graph can spend the per-call budget many times over, so the
					// caller's own signal is combined with a deadline.
					signal: withTurnDeadline(signal),
					recursionLimit: GRAPH_RECURSION_LIMIT,
					configurable: { instructorId: courseGeneration.instructorId },
				}),
			{
				feature: "builder",
				userId: courseGeneration.instructorId,
				model: "gpt-4o-mini",
			},
		);
		return run();
	}

	async runFinalize({
		courseGeneration,
		signal,
	}: {
		courseGeneration: CourseGeneration;
		signal?: AbortSignal;
	}) {
		const initialState = await this.hydrateState({
			courseGeneration,
			userMessage: "",
			mode: "finalize",
		});
		const run = traced(
			"courseAI.graph",
			async () =>
				courseBuilderGraph.streamEvents(initialState, {
					version: "v2",
					// MODEL_TIMEOUT_MS bounds one CALL; this bounds the TURN. A chained
					// graph can spend the per-call budget many times over, so the
					// caller's own signal is combined with a deadline.
					signal: withTurnDeadline(signal),
					recursionLimit: GRAPH_RECURSION_LIMIT,
					configurable: { instructorId: courseGeneration.instructorId },
				}),
			{
				feature: "builder",
				userId: courseGeneration.instructorId,
				model: "gpt-4o-mini",
			},
		);
		return run();
	}
}

export const courseAIService = new CourseAIService();
