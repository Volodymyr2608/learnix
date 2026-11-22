import { DomainError } from "@/server/services/base/base.errors";

/** One error for "not yours", "not refundable" and "flag off" (C1, C24): no oracle. */
export class RefundNotFoundError extends DomainError {
	constructor() {
		super("Payment not found", "NOT_FOUND");
	}
}

export class RefundAlreadyRequestedError extends DomainError {
	constructor(cause?: unknown) {
		super(
			"A refund was already requested for this purchase",
			"CONFLICT",
			cause,
		);
	}
}

/** FR-P18: Stripe refused the refund because the charge is disputed (internal; never reaches a router). */
export class ChargeDisputedError extends Error {}

/** U9: too many requests in a minute, or the student lock was busy — nothing was written. */
export class RefundBusyError extends DomainError {
	constructor(cause?: unknown) {
		super(
			"Too many refund requests right now. Please try again in a minute.",
			"TOO_MANY_REQUESTS",
			cause,
		);
	}
}

/** C21: an evidence file was refused — `reason` says why (type by content, count, total size). */
export class EvidenceRejectedError extends DomainError {
	constructor(readonly reason: "type" | "count" | "size") {
		super(
			{
				type: "Only PNG, JPEG or PDF files are accepted.",
				count: "At most 3 files can be attached.",
				size: "The files together can be at most 4 MB.",
			}[reason],
			"BAD_REQUEST",
		);
	}
}

/** V9: the appeal is not possible in this state (filed already, deadline passed, not needed). */
export class RefundAppealConflictError extends DomainError {
	constructor(message: string) {
		super(message, "CONFLICT");
	}
}

/** Invalid appeal input (FR-S15: reason from the closed list, text required). */
export class RefundAppealInputError extends DomainError {
	constructor(message: string) {
		super(message, "BAD_REQUEST");
	}
}

/** V5: files were attached but the private evidence store is not configured. */
export class EvidenceStorageMissingError extends DomainError {
	constructor() {
		super("Files cannot be accepted right now.", "PRECONDITION_FAILED");
	}
}
