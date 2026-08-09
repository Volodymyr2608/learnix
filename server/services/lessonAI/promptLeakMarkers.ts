/**
 * Distinctive phrases from the STATIC portion of the tutor SYSTEM_PROMPT. If a
 * reply contains one, the model is reciting its instructions.
 *
 * Never add a phrase drawn from `untrustedContext` — that is instructor text and
 * may legitimately appear in an answer.
 *
 * Kept in its own module rather than in `lessonAI.agent.ts` so that importing
 * the markers does not drag `ChatOpenAI` and the RAG tools' `OpenAIEmbeddings`
 * into the consumer's module graph. `lessonAI.agent.test.ts` pins every entry
 * here as a real substring of the assembled prompt, so the two cannot drift.
 */
export const SYSTEM_PROMPT_LEAK_MARKERS: readonly string[] = [
	"Tool usage rules (follow in order):",
	"You are an AI tutor for one lesson of one course",
	"Never paste retrieved lesson content back verbatim",
	"no announcement, no asking permission",
];
