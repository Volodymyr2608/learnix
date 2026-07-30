import type { RunnableConfig } from "@langchain/core/runnables";
import { isAbortError } from "@/lib/guards/isAbortError";
import { logger } from "@/server/utils/logger";
import { classifyNodeError } from "./nodeErrors";
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
			// An aborted request is not a failure: rethrow it untouched so it never
			// enters the failure signal (workstream D counts what is logged here).
			if (isAbortError(err)) throw err;

			const classified = classifyNodeError(err, name);
			logger.error(
				{
					feature: "courseAI",
					node: name,
					kind: classified.retryable ? "retryable" : "fatal",
					err,
				},
				"[courseAI.graph] node failed",
			);
			throw classified;
		}
	};
};
