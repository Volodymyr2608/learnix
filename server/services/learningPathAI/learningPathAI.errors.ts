import { DomainError } from "@/server/services/base/base.errors";

export class LearningPathError extends DomainError {}
export class LearningPathTransientError extends LearningPathError {}
export class LearningPathInvalidError extends LearningPathError {}
export class CourseUnavailableError extends LearningPathError {}
export class LearningPathRateLimitedError extends LearningPathError {}

/**
 * The output boundary rejected model-authored text before it was persisted.
 *
 * Extends LearningPathInvalidError on purpose: the caller must not be able to
 * tell a boundary rejection from a semantic-validation failure. A distinguishable
 * error would give whoever authored the steering content a clean yes/no per
 * generation on whether their text trips L5 — a hill-climbing channel built out
 * of the fix. The distinction lives in the security event, server-side.
 */
export class LearningPathOutputRejectedError extends LearningPathInvalidError {}
