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
