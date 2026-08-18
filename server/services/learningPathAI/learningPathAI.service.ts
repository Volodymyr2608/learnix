import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { checkAiRateLimit } from "@/server/services/_shared/aiLimits";
import { traced } from "@/server/services/_shared/tracing";
import { LearningPathRateLimitedError } from "./learningPathAI.errors";
import { buildLearningPathGraph } from "./learningPathAI.graph";
import type { PathState } from "./learningPathAI.state";
import type { PathStep } from "./schemas/learningPath.schema";

/**
 * The 1/min per-(student, course) rule, now a scoped window on the shared
 * limiter. `countAggregate: false` because the procedure or route has already
 * spent this request's aggregate slot — without it one user action would cost
 * two of the account's AI budget.
 *
 * The courseId reaching this function is a VERIFIED one (the caller checks the
 * enrollment first); a limiter key derived from raw request input would let a
 * caller pick their own bucket.
 */
function checkRateLimit(studentId: string, courseId: string): void {
	const allowed = checkAiRateLimit(studentId, "learningPathAI", {
		scope: courseId,
		countAggregate: false,
	});
	if (!allowed) {
		throw new LearningPathRateLimitedError(
			// Fixed, and deliberately vague about the window: a message naming the
			// rate ("once per minute") or a remaining count hands a caller the shape
			// of the limiter for free (AC 47).
			"Please wait a moment before regenerating your learning path",
			"TOO_MANY_REQUESTS",
		);
	}
}

class LearningPathAIService {
	private readonly graph = buildLearningPathGraph();

	async getForCourse(studentId: string, courseId: string) {
		return learningPathRepository.findByStudentCourse(studentId, courseId);
	}

	async regenerate(studentId: string, courseId: string) {
		checkRateLimit(studentId, courseId);

		return traced(
			"learning-path",
			async () => {
				const result = await this.graph.invoke({ studentId, courseId });
				return learningPathRepository.upsertPath({
					studentId,
					courseId,
					steps: result.finalSteps as PathStep[],
					summary: result.summary,
					weakConcepts: result.generatedWeakConcepts,
					model: "gpt-4o-mini",
				});
			},
			{ feature: "learning-path", userId: studentId, courseId },
		)();
	}

	async *streamRegenerate(studentId: string, courseId: string) {
		checkRateLimit(studentId, courseId);

		const nodeProgressMap: Record<string, string> = {
			loadStudentSignal: "Analyzing your progress…",
			identifyWeakSignals: "Identifying weak areas…",
			setSkipLLM: "Preparing recommendations…",
			proposeReviews: "Finding review materials…",
			proposeNewLessons: "Picking next lessons…",
			mergeAndExplain: "Writing reasoning…",
			reflectAndCheck: "Reviewing the path…",
		};

		const stream = await this.graph.streamEvents(
			{ studentId, courseId },
			{ version: "v2" },
		);

		let finalState: PathState | null = null;

		for await (const event of stream) {
			if (event.event === "on_chain_start" && event.name in nodeProgressMap) {
				yield {
					type: "progress" as const,
					message: nodeProgressMap[event.name],
				};
			}
			if (event.event === "on_chain_end" && event.name === "LangGraph") {
				finalState = event.data?.output as PathState;
			}
		}

		if (!finalState) return;

		const cached = await learningPathRepository.upsertPath({
			studentId,
			courseId,
			steps: finalState.finalSteps as PathStep[],
			summary: finalState.summary,
			weakConcepts: finalState.generatedWeakConcepts,
			model: "gpt-4o-mini",
		});

		yield { type: "done" as const, result: cached };
	}
}

export const learningPathAIService = new LearningPathAIService();
