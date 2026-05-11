import { DomainError } from "@/server/services/base/base.errors";

export class LessonAIError extends DomainError {}

export class OffTopicError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "OffTopicError";
	}
}
