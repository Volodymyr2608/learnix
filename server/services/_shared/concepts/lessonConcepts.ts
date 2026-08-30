import { canonicalConceptSpelling } from "./conceptKey";

/**
 * The concept names a lesson declares, read out of `lessonInsights.concepts`.
 *
 * One rule, one place. The column is `Json` produced by an LLM extraction, with
 * no schema behind it, and what it yields is load-bearing twice over: it is
 * `toolPolicy`'s allowlist — the closed set of concepts the tutor may author a
 * check about — and it is the scope the relevance classifier is told to accept.
 * Two callers deriving it separately is how those two disagree, and a
 * disagreement there is silent: a concept missing from the allowlist looks like
 * a model that declined to ask.
 *
 * Every entry that is not a usable name is dropped rather than passed on. A
 * non-string used to reach `toolPolicy`'s `trim()` and turn a denial into an
 * unhandled error; a name too long to store has no business being in a prompt.
 */
export const lessonConceptNames = (concepts: unknown): string[] => {
	if (!Array.isArray(concepts)) return [];

	return concepts.flatMap((entry) => {
		const name = (entry as { name?: unknown } | null)?.name;
		if (typeof name !== "string") return [];

		// The platform's spelling rule, not a second one: padding collapsed, and
		// null for anything unstorable.
		const canonical = canonicalConceptSpelling(name);
		return canonical ? [canonical] : [];
	});
};
