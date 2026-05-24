import { learningPathRepository } from "@/server/repositories/learningPath.repository";
import { traced } from "@/server/services/_shared/tracing";
import { LearningPathRateLimitedError } from "./learningPathAI.errors";
import { buildLearningPathGraph } from "./learningPathAI.graph";
import type { PathState } from "./learningPathAI.state";
import type { PathStep } from "./schemas/learningPath.schema";

const rateLimitBucket = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;
const EVICT_THRESHOLD = 5_000;

function checkRateLimit(studentId: string, courseId: string): void {
	const key = `${studentId}:${courseId}`;
	const now = Date.now();

	if (rateLimitBucket.size > EVICT_THRESHOLD) {
		for (const [k, ts] of rateLimitBucket) {
			if (now - ts >= RATE_LIMIT_MS) rateLimitBucket.delete(k);
		}
	}

	const lastAt = rateLimitBucket.get(key) ?? 0;
	if (now - lastAt < RATE_LIMIT_MS) {
		throw new LearningPathRateLimitedError(
			"You can only regenerate once per minute",
			"TOO_MANY_REQUESTS",
		);
	}
	rateLimitBucket.set(key, now);
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
