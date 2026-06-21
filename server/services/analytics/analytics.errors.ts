import { DomainError } from "@/server/services/base/base.errors";

export class AnalyticsError extends DomainError {}

export class CourseNotFoundError extends AnalyticsError {
	constructor(ctx?: Record<string, unknown>) {
		super("Course not found", "NOT_FOUND", undefined, ctx);
	}
}
