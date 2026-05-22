import { CourseAIError } from "@/server/services/courseAI/courseAI.errors";
import { logger } from "@/server/utils/logger";
import type { CourseBuilderStateT } from "./state";

type NodeFn = (
  state: CourseBuilderStateT,
) => Promise<Partial<CourseBuilderStateT>>;

export const withNodeErrors = (name: string, fn: NodeFn): NodeFn => {
  return async (state) => {
    try {
      return await fn(state);
    } catch (err) {
      logger.error(err);
      throw new CourseAIError(`[courseAI.graph] node "${name}" failed`);
    }
  };
};