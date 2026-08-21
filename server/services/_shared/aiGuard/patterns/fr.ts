import type { InjectionPattern } from "./types";

const ID = {
	overrideIgnorePrior: "fr:override-ignore-prior",
	overrideNewInstructions: "fr:override-new-instructions",
	roleYouAreNow: "fr:role-you-are-now",
	roleActAs: "fr:role-act-as",
	leakRepeatInstructions: "fr:leak-repeat-instructions",
	leakWhatIsYourPrompt: "fr:leak-what-is-your-prompt",
} as const;

export const FR_RULE_IDS = Object.values(ID);

/**
 * French variants of the six English prose families, at parity weights.
 * Like Spanish, the adjective follows the noun ("instructions précédentes"),
 * so the override rule reads verb → noun → adjective.
 *
 * Accented and unaccented spellings are both accepted throughout: students
 * type without accents far more often than not.
 */
export const FR_PATTERNS: InjectionPattern[] = [
	{
		id: ID.overrideIgnorePrior,
		lang: "fr",
		category: "instruction_override",
		regex:
			/\b(ignor|oubli|n[ée]glig|[ée]cart)\w*\b[^.\n]{0,40}\b(instruction|consigne|r[èe]gle|prompt)\w*\b[^.\n]{0,20}\b(pr[ée]c[ée]dent\w*|ant[ée]rieur\w*|ci-dessus)\b/i,
		weight: 30,
	},
	{
		id: ID.overrideNewInstructions,
		lang: "fr",
		category: "instruction_override",
		regex:
			/\bnouvelles?\s+(instructions|consignes)\s*:|\b(instructions|consignes)\s+mises?\s+à\s+jour\s*:/i,
		weight: 25,
	},
	{
		id: ID.roleYouAreNow,
		lang: "fr",
		category: "role_reassignment",
		regex:
			/\b(tu\s+es|vous\s+[êe]tes)\s+(maintenant|d[ée]sormais)\s+(un|une|le|la)\b/i,
		weight: 20,
	},
	{
		id: ID.roleActAs,
		lang: "fr",
		category: "role_reassignment",
		regex:
			/\b(agis|comporte-toi|fais\s+semblant|pr[ée]tends)\s+(comme|que|d[e'’])/i,
		weight: 20,
	},
	{
		id: ID.leakRepeatInstructions,
		lang: "fr",
		category: "prompt_leak",
		regex:
			/\b(r[ée]p[èe]te|r[ée]v[èe]le|montre|affiche)\b[^.\n]{0,20}\b(prompt syst[èe]me|tes instructions|tes r[èe]gles)\b/i,
		weight: 35,
	},
	{
		id: ID.leakWhatIsYourPrompt,
		lang: "fr",
		category: "prompt_leak",
		regex:
			/\b(quel|quelles?|quels)\s+(est|sont)\s+(ton|tes)\s+(prompt|instructions|r[èe]gles)\b/i,
		weight: 35,
	},
];
