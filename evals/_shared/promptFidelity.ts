/**
 * An eval must run the prompt production runs. Anything else measures a
 * fiction: `lessonAI/tutor.eval.ts` once carried a hand-written copy that
 * contradicted the shipped tool-selection rule and omitted the untrusted-data
 * clause entirely, so a green run said nothing about the shipped agent.
 *
 * This module is the detector plus the list of deliberate exceptions.
 */

/** Strip comments so a prompt quoted in a doc comment is not a finding. */
export const stripComments = (source: string): string =>
	source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * A hand-written system prompt, detected by what it *says* rather than how it
 * is declared — renaming the const, switching to `let`, or inlining the literal
 * straight into `createAgent({ systemPrompt: ... })` are all the same defect,
 * and a declaration-shaped rule catches only the spelling it was written for.
 *
 * Every system prompt in this repo opens by addressing the model in the second
 * person, which is what makes the content check possible at all.
 */
const PROMPT_LITERAL = /["'`]\s*You are\b/;

export const containsHandWrittenPrompt = (source: string): boolean =>
	PROMPT_LITERAL.test(stripComments(source));

export type HandWrittenByDesign = {
	/** Repo-relative path of the eval. */
	file: string;
	/** Why this eval cannot use the real prompt. */
	reason: string;
};

/**
 * Evals that write their own prompt on purpose. Each entry is a claim, and
 * `promptFidelity.contract.test.ts` checks the claim is still true — an entry
 * whose file no longer has a hand-written prompt fails, so the list cannot
 * quietly grant permission to a file that stopped needing it.
 */
export const HAND_WRITTEN_BY_DESIGN: HandWrittenByDesign[] = [
	{
		file: "evals/aiGuard/indirect.eval.ts",
		reason:
			"Measures whether an indirect payload can extract instructions, which requires a sentinel token (ZEPHYR-7719) planted in the system prompt and absent from every real one. Importing the shipped prompt would remove the only signal that distinguishes extraction from plausible paraphrase.",
	},
];
