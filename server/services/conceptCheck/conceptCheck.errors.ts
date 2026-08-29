import { DomainError } from "@/server/services/base/base.errors";

/** The student is not enrolled in the course the lesson belongs to. */
export class ConceptCheckForbiddenError extends DomainError {}

/**
 * A check is already open on this lesson. Benign: the tutor reports it as a
 * result, never as a failure, because the student simply has a question waiting.
 */
export class CheckAlreadyPendingError extends DomainError {}

/**
 * The student has spent what this concept is worth — three checks ever, or a
 * wrong answer inside the cooldown, or evidence they already hold. One class for
 * all three: the tutor's reply is the same in every case, and splitting them
 * would let a caller report which bound was hit.
 */
export class CheckBudgetSpentError extends DomainError {}
