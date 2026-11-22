import { TRPCError } from "@trpc/server";

/**
 * AC-C1 / AC-C24 (audit L-1): another student's payment, the flag off, or a malformed id in the
 * URL is a plain 404 — never the error page. Anonymous and wrong-role visitors are redirected by
 * `app/dashboard/layout.tsx` before this page renders.
 */
export const isRefundPageNotFound = (error: unknown): boolean =>
	error instanceof TRPCError &&
	(error.code === "NOT_FOUND" || error.code === "BAD_REQUEST");
