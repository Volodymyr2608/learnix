export class UnknownTemplateError extends Error {
	readonly code = "UNKNOWN_TEMPLATE";
	constructor(key: string) {
		super(`Unknown email template: ${key}`);
		this.name = "UnknownTemplateError";
	}
}

export class InvalidPayloadError extends Error {
	readonly code = "INVALID_PAYLOAD";
	constructor(public readonly issues: unknown) {
		super("Invalid email payload");
		this.name = "InvalidPayloadError";
	}
}

export class ResendSendError extends Error {
	readonly code = "RESEND_SEND_FAILED";
	constructor(detail: string) {
		super(detail);
		this.name = "ResendSendError";
	}
}