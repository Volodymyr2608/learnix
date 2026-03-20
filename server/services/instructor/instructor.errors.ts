export class InstructorError extends Error {
	constructor(
		message: string,
		public cause?: unknown,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "InstructorError";
	}
}
