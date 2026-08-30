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

/**
 * The check cannot be answered — and deliberately does not say why.
 *
 * Absent, belonging to someone else, already answered and expired are four
 * causes with one message and one code. Distinguishable errors would turn
 * `checkId` into an oracle: a caller could walk ids and learn which exist and
 * whose they are. Same requirement, and the same reasoning, as the guard's
 * byte-identical refusals.
 *
 * The message must stay free of the cause. Adding "expired" to help a student
 * is the change that reopens this.
 */
export class CheckUnavailableError extends DomainError {}
