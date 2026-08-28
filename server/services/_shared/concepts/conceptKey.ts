import { MAX_CONCEPT_NAME_LENGTH } from "@/server/services/mastery/masteryLevels";

/**
 * The one rule for comparing concept names, and the only place it is written.
 *
 * Before this module the same key was compared two different ways — case
 * *insensitively* in `toolPolicy`, case *sensitively* through `.includes()` in
 * `identifyWeakSignals` — so a mastery row the tutor legitimately wrote could
 * fail to match in the learning path. A silent loss, in the direction that shows
 * up as nothing at all.
 */

/**
 * Exactly what POSIX `[[:space:]]` matches, and deliberately not JS `\s`.
 *
 * `\s` additionally matches U+00A0, U+2009, U+FEFF and the rest of the Unicode
 * space separators; `[[:space:]]` does not. The stored `conceptKey` column is
 * backfilled by SQL and recomputed here on every write, so the two expressions
 * have to agree on every input. Folding more aggressively in TypeScript than in
 * SQL maps two distinct rows onto one key and binds a write to the wrong row —
 * an authorization bug wearing an encoding costume.
 */
const POSIX_SPACE_RUN = /[ \t\n\v\f\r]+/g;
const POSIX_SPACE_PADDING = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;

/**
 * ASCII-only case folding, matching `lower(… COLLATE "C")` in the backfill.
 *
 * `lower()` is collation-dependent where `String.prototype.toLowerCase()` is
 * Unicode-defined, and the two disagree on real inputs: `lower('İ')` under a
 * UTF-8 locale yields a bare `i`, while `"İ".toLowerCase()` expands to
 * `i` + U+0307. ASCII is the largest range on which every collation agrees, so
 * it is the range this folds. The cost is under-folding a non-ASCII pair that a
 * human would call the same concept — two rows instead of one, which reads as a
 * missed match rather than as one student's evidence binding to another's row.
 */
const asciiLower = (value: string): string =>
	value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

const collapse = (raw: string): string =>
	raw.replace(POSIX_SPACE_PADDING, "").replace(POSIX_SPACE_RUN, " ");

/**
 * The comparison key. Never displayed and never stored as the name — it is what
 * `ConceptMastery.conceptKey` holds and what the unique constraint is on.
 */
export const conceptKey = (raw: string): string => asciiLower(collapse(raw));

/**
 * The spelling a concept is stored and displayed under: padding collapsed, case
 * preserved. Returns null when the name cannot be stored at all, so a caller has
 * to decide what to do rather than write an empty or oversized concept.
 *
 * Length is measured after collapsing, because the padding is not part of the
 * name and an allowlist entry is model-authored JSON that can carry plenty.
 */
export const canonicalConceptSpelling = (raw: string): string | null => {
	const name = collapse(raw);
	if (name.length === 0 || name.length > MAX_CONCEPT_NAME_LENGTH) return null;
	return name;
};

export type ResolvedConcept = {
	/** The allowlist's spelling, canonicalised. What gets stored and shown. */
	concept: string;
	/** The comparison key for that spelling. What the unique constraint sees. */
	key: string;
};

/**
 * Resolves a caller-supplied concept name against an allowlist, returning the
 * *allowlist's* spelling — never the caller's. The caller here is a model, and
 * letting its spelling reach the table is how one concept ends up stored twice.
 *
 * Returns null when the name is not allowlisted or when the matching entry is
 * not storable; both are refusals, and neither is distinguishable from the
 * other by the caller.
 */
export const resolveAllowlistedConcept = (
	needle: string,
	allowlist: readonly string[],
): ResolvedConcept | null => {
	const key = conceptKey(needle);
	if (key.length === 0) return null;

	const match = allowlist.find((candidate) => conceptKey(candidate) === key);
	if (match === undefined) return null;

	const concept = canonicalConceptSpelling(match);
	if (concept === null) return null;

	return { concept, key };
};
