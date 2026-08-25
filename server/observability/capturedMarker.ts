const MARKER = "__sentryCaptured";

/**
 * Marks an error instance as already reported, so the same failure is not captured
 * twice as it propagates (spec.md AC 2).
 *
 * The concrete path this closes: lib/requests/** calls createCaller, so an exception
 * passes through the tRPC middleware — captured there — then propagates and is caught
 * by safeRequest, which would capture it again. Two events per RSC failure across all
 * 34 call sites, halving a 5,000-event monthly budget.
 *
 * `enumerable: false` is load-bearing, not tidiness: a plain assignment would show up
 * in Object.keys, in any spread of the error, and in JSON.stringify — including the
 * serialisations the redaction tests perform.
 */
export const markCaptured = (error: unknown): void => {
	if (error === null || typeof error !== "object") return;
	Object.defineProperty(error, MARKER, {
		value: true,
		enumerable: false,
		configurable: true,
		writable: true,
	});
};

export const isCaptured = (error: unknown): boolean =>
	error !== null &&
	typeof error === "object" &&
	(error as Record<string, unknown>)[MARKER] === true;
