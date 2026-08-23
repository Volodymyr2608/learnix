import type { ProjectionContext } from "./projectError";

/**
 * Grouping is fixed server-side (spec.md AC 23, security.md S4).
 *
 * Sentry's default grouping derives partly from the exception message. Instructor
 * lesson content and student chat messages flow through the AI services, so if any of
 * it survived into a message the author would choose both the issue title and the
 * fingerprint — letting them fragment one real error into a thousand issues to bury
 * it, or aim text at whoever reads the dashboard.
 *
 * So the fingerprint is built only from values the server authored: the tRPC path or
 * the operation name, plus the error's class. Never the message.
 */
export const fingerprintFor = (
	error: unknown,
	context?: ProjectionContext,
): string[] => {
	const className =
		(error as { constructor?: { name?: string } })?.constructor?.name ??
		typeof error;
	const site = context?.path ?? context?.op ?? context?.feature ?? "unknown";

	return [site, className];
};

/** The key the throttle counts against; mirrors the fingerprint Sentry will group by. */
export const fingerprintKeyOf = (event: {
	fingerprint?: string[];
	exception?: { values?: Array<{ type?: string }> };
}): string =>
	event.fingerprint?.join("|") ??
	event.exception?.values?.[0]?.type ??
	"unknown";
