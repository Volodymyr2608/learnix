import { DomainError } from "@/server/services/base/base.errors";

export class QuizError extends DomainError {}
export class QuizNotFoundError extends DomainError {}
export class QuizForbiddenError extends DomainError {}
export class AlreadyAttemptedError extends DomainError {}
