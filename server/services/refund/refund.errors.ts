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
