import { DomainError } from "@/server/services/base/base.errors";

export class LearningPathError extends DomainError {}
export class LearningPathTransientError extends LearningPathError {}
export class LearningPathInvalidError extends LearningPathError {}
export class CourseUnavailableError extends LearningPathError {}
export class LearningPathRateLimitedError extends LearningPathError {}