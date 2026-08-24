import type { RunnableConfig } from "@langchain/core/runnables";
import { logger } from "@/server/utils/logger";
import { classifyNodeError, isNodeAbort } from "./nodeErrors";
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
			if (isNodeAbort(err)) throw err;

			const classified = classifyNodeError(err, name);
			// Downgraded off `error` (S9): app/api/chat/course/route.ts's outer catch
			// re-logs this same failure at `error` level once `classified` propagates
			// through the graph, so logging it here too would double-capture every
			// node failure. `logger.error` is Task 8's only Sentry-reporting
			// chokepoint (server/utils/logger.ts), so `debug` keeps this a local
			// breadcrumb. Only a scalar class name travels — never the raw `err` —
			// for the same "no free text, ever" reason the error-level sites in this
			// feature follow.
			logger.debug(
				{
					feature: "courseAI",
					node: name,
					kind: classified.retryable ? "retryable" : "fatal",
					errorName: err instanceof Error ? err.name : String(err),
				},
				"[courseAI.graph] node failed",
			);
			throw classified;
		}
	};
};
