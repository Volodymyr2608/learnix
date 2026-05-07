import { DomainError } from "@/server/services/base/base.errors";

export class QuizAIError extends DomainError {}

export class LessonHasNoContentError extends DomainError {
	constructor(lessonId: string) {
		super(
			"Lesson has no content to generate quiz from",
			"BAD_REQUEST",
			undefined,
			{ lessonId },
		);
	}
}

export class MaxRetriesExceededError extends DomainError {
	constructor(lessonId: string) {
		super(
			"Generation failed after max retries",
			"INTERNAL_SERVER_ERROR",
			undefined,
			{ lessonId },
		);
	}
}
