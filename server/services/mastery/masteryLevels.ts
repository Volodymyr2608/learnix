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
