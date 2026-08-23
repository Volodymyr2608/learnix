import "server-only";
import { reportError } from "@/server/observability/reportError";

/**
 * The shape every file under lib/requests/** repeats: call a tRPC procedure through
 * the RSC caller, and on failure log and return a fallback so the page still renders.
 *
 * Swallowing is a deliberate rendering decision and it stays. What changes is that
 * the error is reported first, instead of vanishing into stdout — all 34 of these
 * were the largest silent hole in the app.
 *
 * `op` is a parameter rather than derived from the message because 6 of the 34 sites
 * had a bare `console.error(error)` with nothing to derive from; without it those six
 * would all fingerprint together (spec.md AC 8).
 *
 * `fallback` is a parameter, and generic, because it is NOT uniformly null: several
 * sites return a typed empty shape (getEnrollmentStatus returns
 * { isEnrolled: false, nextLessonId: null }, getPublishedCourses returns
 * { courses: [], total: 0 }). Each call site must pass exactly what it returned
 * before — the failure-path rendering has to stay byte-identical.
 *
 * Double capture is handled inside reportError: these call the same createCaller the
 * tRPC middleware wraps, so the error usually arrives here already captured and
 * marked. reportError then tags it with `op` instead of raising a second event.
 */
export const safeRequest = async <T>(
	op: string,
	fn: () => Promise<T>,
	fallback: T,
): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		reportError(error, `safeRequest:${op}`, { op });
		return fallback;
	}
};
