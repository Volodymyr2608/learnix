import { TRPCError } from "@trpc/server";

/**
 * tRPC codes that mean "the caller did something wrong", not "we are broken".
 *
 * This is a quota control, not a taste preference (spec.md AC 4). NOT_FOUND and
 * UNAUTHORIZED are the most frequent errors any web app throws and are almost always
 * client-fault; reporting them would exhaust a 5,000-event month during ordinary
 * browsing, and Sentry then DROPS rather than bills — so the real failures would
 * vanish for the rest of the month.
 *
 * CONFLICT is here because AC 26 maps duplicate-signup to it: user.signUp and
 * instructor.create are publicProcedures, so an unauthenticated script hitting signup
 * with one repeated address must not be able to burn the budget.
 */
const CLIENT_FAULT_CODES = new Set([
	"UNAUTHORIZED",
	"FORBIDDEN",
	"NOT_FOUND",
	"BAD_REQUEST",
	"TOO_MANY_REQUESTS",
	"CONFLICT",
]);

export const shouldReport = (error: unknown): boolean =>
	!(error instanceof TRPCError && CLIENT_FAULT_CODES.has(error.code));
