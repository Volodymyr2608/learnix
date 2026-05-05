import { TRPCError } from "@trpc/server";
import { DomainError } from "@/server/services/base/base.errors";

export function handleServiceError(error: unknown): never {
	if (error instanceof TRPCError) throw error;

	if (error instanceof DomainError) {
		throw new TRPCError({
			code: error.code,
			message: error.message,
			cause: error.cause,
		});
	}

	if (error instanceof Error) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: error.message,
		});
	}

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred",
	});
}
