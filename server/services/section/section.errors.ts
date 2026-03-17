export class SectionError extends Error {
	constructor(
		message: string,
		public cause?: unknown,
		public context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "SectionError";
	}
}
