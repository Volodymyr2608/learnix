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
		/**
		 * 33 call sites populate `context` today and they are NOT all scalar ids:
		 * `instructor.service.ts:85` passes `{ dto }` — the signup DTO, plaintext
		 * password included — on a `publicProcedure`, `course.service.ts:70`/`:328`
		 * pass course DTOs, and `search.service.ts:34` passes the raw search query.
		 *
		 * `enrichScope` therefore runs the AC 10 allowlist itself; it is not a
		 * pass-through. Nothing here may assume the caller vetted the object.
		 */
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
	 *
	 * The class name is NOT enriched onto the scope here. It does not need to be: the
	 * original travels as `cause`, and projectError walks that chain and names each
	 * link — the unmapped error becomes its own `exception.values[]` entry with the
	 * server-authored message `caused by <ClassName>`. An `enrichScope` call would
	 * additionally have to invent an allowlist key (AC 10 pins the eight that exist,
	 * and `name` is not one), so it would be dropped rather than transmitted.
	 */
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "An unexpected error occurred",
		cause: error,
	});
}
