import { DomainError } from "@/server/services/base/base.errors";

export class CourseAIError extends DomainError {}
export class CourseAIToolError extends DomainError {}

/** A node failed for a reason that may not recur: provider timeout, rate limit, network fault. */
export class RetryableNodeError extends DomainError {
	readonly retryable = true;
}

/** A node failed for a reason that recurs until code or configuration changes. */
export class FatalNodeError extends DomainError {
	readonly retryable = false;
}
