import { traceable } from "langsmith/traceable";
import { env } from "@/lib/env";

export interface TraceContext {
	feature: string;
	userId?: string;
	courseId?: string;
	model?: string;
}

type AsyncFn = (...args: never[]) => Promise<unknown>;

/**
 * Wraps an async function with LangSmith tracing when LANGSMITH_TRACING is enabled.
 * Tags the run with feature, userId, courseId, and model per ADR-013.
 */
export function traced<T extends AsyncFn>(
	name: string,
	fn: T,
	ctx: TraceContext,
): T {
	if (!env.LANGSMITH_TRACING) return fn;

	const tags = [
		`feature:${ctx.feature}`,
		ctx.userId ? `userId:${ctx.userId}` : null,
		ctx.courseId ? `courseId:${ctx.courseId}` : null,
		ctx.model ? `model:${ctx.model}` : null,
	].filter((t): t is string => t !== null);

	return traceable(fn, { name, tags }) as T;
}
