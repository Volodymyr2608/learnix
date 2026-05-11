import { DomainError } from "@/server/services/base/base.errors";

export class LessonHasNoContentError extends DomainError {
	constructor(lessonId: string) {
		super("This lesson has no content to summarise", "BAD_REQUEST", undefined, {
			lessonId,
		});
	}
}

export class NotInstructorError extends DomainError {
	constructor(lessonId: string) {
		super("Lesson not found or access denied", "FORBIDDEN", undefined, {
			lessonId,
		});
	}
}
