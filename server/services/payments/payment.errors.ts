import { DomainError } from "@/server/services/base/base.errors";

export class PaymentError extends DomainError {}

export class CourseIsFreeError extends PaymentError {
	constructor(ctx?: Record<string, unknown>) {
		super("This course is free", "BAD_REQUEST", undefined, ctx);
	}
}

export class AlreadyEnrolledError extends PaymentError {
	constructor(ctx?: Record<string, unknown>) {
		super(
			"You are already enrolled in this course",
			"CONFLICT",
			undefined,
			ctx,
		);
	}
}

export class CourseNotPurchasableError extends PaymentError {
	constructor(ctx?: Record<string, unknown>) {
		super("Course not found or not purchasable", "NOT_FOUND", undefined, ctx);
	}
}

export class ConnectNotReadyError extends PaymentError {
	constructor(ctx?: Record<string, unknown>) {
		super("Stripe account is not ready", "BAD_REQUEST", undefined, ctx);
	}
}

/** AC-F11: an admin "Retry" on a payment that does not exist or is not in a retryable state. */
export class PayoutRetryError extends DomainError {}

/** EC-17 (W9): a dispute on an earlier payment of this course is still open at the bank. */
export class RepurchaseDisputedError extends PaymentError {
	constructor(ctx?: Record<string, unknown>) {
		super(
			"A dispute about your earlier payment for this course is still open with your bank",
			"CONFLICT",
			undefined,
			ctx,
		);
	}
}
