import type { UntrustedSource } from "./types";

/**
 * Layer 3 of the guard: structural isolation for text Learnix did not author
 * (lesson bodies, course data, generated summaries).
 *
 * Escaping is scoped to the literal `untrusted_data` tag name only — NOT a
 * blanket HTML escape — so lesson content discussing markup or using `<` in
 * maths survives intact. The only real closing tag is the one appended here,
 * so embedded content cannot pre-empt it.
 *
 * Pair with UNTRUSTED_DATA_CLAUSE in the consuming system prompt; the wrapper
 * alone tells the model nothing about how to treat the region.
 */
export const wrapUntrustedContent = (
	content: string,
	source: UntrustedSource,
): string => {
	const escaped = content.replace(
		/<(\/?)untrusted_data\b/gi,
		"&lt;$1untrusted_data",
	);
	return `<untrusted_data source="${source}">\n${escaped}\n</untrusted_data>`;
};
