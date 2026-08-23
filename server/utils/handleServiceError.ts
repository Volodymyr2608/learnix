import { TRPCError } from "@trpc/server";
import { enrichScope } from "@/server/observability/reportError";
import { DomainError } from "@/server/services/base/base.errors";

/**
 * Maps a service-layer error onto a TRPCError.
 *
 * It ENRICHES the Sentry scope but never captures. ADR-010:113 named this file as
 * "the single place to add cross-cutting behaviour (Sentry, structured logging)";
 * that line predates the tRPC error middleware and is refined by ADR-029 into
 * "enrich here, capture at the boundary". Capturing in both places would report every
 * service error twice and spend the free-tier quota at double rate — and this
 * function is called by nearly every router procedure.
 */
export function handleServiceError(error: unknown): never {
	if (error instanceof TRPCError) throw error;

	if (error instanceof DomainError) {
		// Only four call sites populate context today (course.service.ts:109, :477,
		// :514 and enrollment.service.ts:39), so this is a no-op for most errors.
		if (error.context) enrichScope("domainError", error.context);

		throw new TRPCError({
			code: error.code,
			message: error.message,
			cause: error.cause,
		});
	}

	/**
	 * An unmapped throw yields a FIXED message (spec.md AC 12).
	 *
	 * This previously copied `error.message` verbatim, which is a live disclosure
	 * independent of Sentry: three LangChain constructors embed untrusted payload in
	 * that field — OutputParserException carries the entire model output, and
	 * lessonInsightsAI does not wrap its chain invokes — so lesson-derived model text
	 * reached the browser, and would have become the Sentry issue title.
	 *
	 * The original is preserved as `cause` for server-side telemetry; the projection
	 * in server/observability/projectError.ts is what keeps it from being transmitted.
	 */
	enrichScope("errorClass", {
		name: (error as { constructor?: { name?: string } })?.constructor?.name,
	});

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred",
		cause: error,
	});
}
