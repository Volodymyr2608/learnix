import type { RunnableConfig } from "@langchain/core/runnables";
import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";
import type { CourseBuilderStateT } from "./state";

type NodeFn = (
	state: CourseBuilderStateT,
	config?: RunnableConfig,
) => Promise<Partial<CourseBuilderStateT>>;

export const withNodeErrors = (name: string, fn: NodeFn): NodeFn => {
	return async (state, config) => {
		try {
			return await fn(state, config);
		} catch (err) {
			logger.error(err);
			throw new CourseAIError(`[courseAI.graph] node "${name}" failed`);
		}
	};
};
