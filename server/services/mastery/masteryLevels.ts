/**
 * The two ceilings on a `ConceptMastery.level`, in one module because the only
 * thing that makes either meaningful is their ordering.
 *
 * Conversation may raise mastery to `CONVERSATION_MAX_LEVEL`. `QUIZ_MASTERY_LEVEL`
 * is reachable only by answering every quiz on the lesson correctly —
 * confirmation by action, not by text, because a persuasive message is not
 * evidence of understanding. Split across two files, that argument was a comment
 * in one of them; here it is a fact a test can assert.
 */
export const CONVERSATION_MAX_LEVEL = 2;

export const QUIZ_MASTERY_LEVEL = 3;

/**
 * The bound the level-2 tool schema has always enforced, now the bound on every
 * concept name that reaches a durable record.
 */
export const MAX_CONCEPT_NAME_LENGTH = 80;

/**
 * The one spelling a concept is stored under. `ConceptMastery` is unique on the
 * exact string, so two writers that disagree about whitespace produce two rows
 * for one concept — and the learning path then recommends reviewing something
 * the student has demonstrably mastered, which is this feature's own defect
 * reached from the other end.
 *
 * Returns null when the name cannot be stored at all, so a caller has to decide
 * what to do rather than write an empty or oversized concept.
 */
export const canonicalConceptName = (raw: string): string | null => {
	const name = raw.trim();
	if (name.length === 0 || name.length > MAX_CONCEPT_NAME_LENGTH) return null;
	return name;
};
