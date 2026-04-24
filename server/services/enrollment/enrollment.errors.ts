export class EnrollmentError extends Error {
	constructor(
		message: string,
		public code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST",
		public cause?: unknown,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "EnrollmentError";
	}
}
