export type PatternCategory =
	| "instruction_override"
	| "role_reassignment"
	| "prompt_leak"
	| "structure_markup"
	| "jailbreak_template";

export type InjectionPattern = {
	id: string;
	category: PatternCategory;
	regex: RegExp;
	weight: number;
};

/** Score at or above this blocks. Below it (and above 0) escalates to L2. */
export const BLOCK_THRESHOLD = 40;

/**
 * Every pattern requires a COMBINATION (verb + object), never a bare keyword.
 * That is the mechanism behind the ≤5% false-positive target: prose that merely
 * describes an attack trips at most one low-weight rule and lands in "suspect",
 * which never blocks on its own.
 */
export const INJECTION_PATTERNS: InjectionPattern[] = [
	{
		id: "override-ignore-prior",
		category: "instruction_override",
		// Weight deliberately kept BELOW BLOCK_THRESHOLD: a single match fires on
		// a quoted/attributed mention too ("the phrase 'ignore previous
		// instructions'" in educational prose), which must escalate to L2, not
		// block outright. Only markup-fake-tokens, markup-injected-tags, and
		// jailbreak-dan are unambiguous enough to block alone.
		regex:
			/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?)\b/i,
		weight: 30,
	},
	{
		id: "override-new-instructions",
		category: "instruction_override",
		regex: /\b(new|updated)\s+instructions?\s*:/i,
		weight: 25,
	},
	{
		id: "role-you-are-now",
		category: "role_reassignment",
		regex: /\byou\s+are\s+now\s+(a|an|the)\b/i,
		weight: 20,
	},
	{
		id: "role-act-as",
		category: "role_reassignment",
		regex: /\b(act|pretend|behave)\s+as\s+(a|an|if)\b/i,
		weight: 20,
	},
	{
		id: "role-system-marker",
		category: "role_reassignment",
		regex: /^\s*(system|assistant)\s*:/im,
		weight: 30,
	},
	{
		id: "leak-repeat-instructions",
		category: "prompt_leak",
		regex:
			/\b(repeat|reveal|show|print|output)\b[^.\n]{0,20}\b(system prompt|your instructions|your rules)\b/i,
		weight: 35,
	},
	{
		id: "leak-what-is-your-prompt",
		category: "prompt_leak",
		regex: /\bwhat\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions)\b/i,
		weight: 35,
	},
	{
		id: "markup-fake-tokens",
		category: "structure_markup",
		regex: /<\|(im_start|im_end|system|endoftext)\|>/i,
		weight: 45,
	},
	{
		id: "markup-injected-tags",
		category: "structure_markup",
		regex: /<\/?(system|instructions|untrusted_data)\b[^>]*>/i,
		weight: 45,
	},
	{
		id: "jailbreak-dan",
		category: "jailbreak_template",
		regex: /\bdo\s+anything\s+now\b|\bDAN\s+mode\b/i,
		weight: 40,
	},
	{
		id: "jailbreak-developer-mode",
		category: "jailbreak_template",
		regex: /\bdeveloper\s+mode\b[^.\n]{0,20}\benabled?\b/i,
		weight: 35,
	},
];
