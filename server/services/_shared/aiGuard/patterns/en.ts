import type { InjectionPattern } from "./types";

const ID = {
	overrideIgnorePrior: "en:override-ignore-prior",
	overrideNewInstructions: "en:override-new-instructions",
	roleYouAreNow: "en:role-you-are-now",
	roleActAs: "en:role-act-as",
	leakRepeatInstructions: "en:leak-repeat-instructions",
	leakWhatIsYourPrompt: "en:leak-what-is-your-prompt",
	jailbreakDanProse: "en:jailbreak-dan-prose",
	jailbreakDeveloperMode: "en:jailbreak-developer-mode",
} as const;

export const EN_RULE_IDS = Object.values(ID);

/**
 * Every rule requires a COMBINATION (verb + object), never a bare keyword.
 * That is the mechanism behind the ≤5% false-positive target: prose that merely
 * describes an attack trips at most one low-weight rule and lands in "suspect",
 * which never blocks on its own.
 *
 * The first six are the prose families translated into es/fr/de at parity
 * weights. The last two are English-only by decision (security.md S6): DAN's
 * prose half and developer-mode are English jargon, and translating them at
 * parity would put a weight-40 rule into three more languages for no measured
 * gain.
 */
export const EN_PATTERNS: InjectionPattern[] = [
	{
		// Weight deliberately kept BELOW BLOCK_THRESHOLD: a single match fires on
		// a quoted/attributed mention too ("the phrase 'ignore previous
		// instructions'" in educational prose), which must escalate to L2, not
		// block outright.
		id: ID.overrideIgnorePrior,
		lang: "en",
		category: "instruction_override",
		regex:
			/\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?)\b/i,
		weight: 30,
	},
	{
		id: ID.overrideNewInstructions,
		lang: "en",
		category: "instruction_override",
		regex: /\b(new|updated)\s+instructions?\s*:/i,
		weight: 25,
	},
	{
		id: ID.roleYouAreNow,
		lang: "en",
		category: "role_reassignment",
		regex: /\byou\s+are\s+now\s+(a|an|the)\b/i,
		weight: 20,
	},
	{
		id: ID.roleActAs,
		lang: "en",
		category: "role_reassignment",
		regex: /\b(act|pretend|behave)\s+as\s+(a|an|if)\b/i,
		weight: 20,
	},
	{
		id: ID.leakRepeatInstructions,
		lang: "en",
		category: "prompt_leak",
		regex:
			/\b(repeat|reveal|show|print|output)\b[^.\n]{0,20}\b(system prompt|your instructions|your rules)\b/i,
		weight: 35,
	},
	{
		id: ID.leakWhatIsYourPrompt,
		lang: "en",
		category: "prompt_leak",
		regex: /\bwhat\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions)\b/i,
		weight: 35,
	},
	{
		id: ID.jailbreakDanProse,
		lang: "en",
		category: "jailbreak_template",
		regex: /\bdo\s+anything\s+now\b/i,
		weight: 40,
	},
	{
		id: ID.jailbreakDeveloperMode,
		lang: "en",
		category: "jailbreak_template",
		regex: /\bdeveloper\s+mode\b[^.\n]{0,20}\benabled?\b/i,
		weight: 35,
	},
];