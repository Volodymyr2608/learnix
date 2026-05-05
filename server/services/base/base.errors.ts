import type { TRPCError } from "@trpc/server";

type TRPCCode = ConstructorParameters<typeof TRPCError>[0]["code"];

export abstract class DomainError extends Error {
	constructor(
		message: string,
		public readonly code: TRPCCode = "INTERNAL_SERVER_ERROR",
		public readonly cause?: unknown,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}
