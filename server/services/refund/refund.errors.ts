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
