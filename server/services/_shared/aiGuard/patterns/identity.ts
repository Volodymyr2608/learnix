/**
 * Anchored so it can only strip a *leading* prefix. An id that happens to
 * contain "en:" later in the string is left alone.
 */
const LANG_PREFIX = /^(en|es|fr|de):/;

/**
 * The language-independent grouping key for scoring. Variants of one rule
 * across languages share an identity; a universal id is its own identity.
 *
 * Deliberately derived rather than stored on the pattern: a hand-authored
 * `identity` field alongside `id` is a second source of truth, and it will
 * drift (security.md S5).
 */
export const ruleIdentity = (id: string): string => id.replace(LANG_PREFIX, "");
