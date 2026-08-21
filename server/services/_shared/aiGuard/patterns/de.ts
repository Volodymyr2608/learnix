import type { InjectionPattern } from "./types";

const ID = {
	overrideIgnorePrior: "de:override-ignore-prior",
	overrideNewInstructions: "de:override-new-instructions",
	roleYouAreNow: "de:role-you-are-now",
	roleActAs: "de:role-act-as",
	leakRepeatInstructions: "de:leak-repeat-instructions",
	leakWhatIsYourPrompt: "de:leak-what-is-your-prompt",
} as const;

export const DE_RULE_IDS = Object.values(ID);

/**
 * German variants of the six English prose families, at parity weights.
 * German shares English's adjective-before-noun order ("vorherigen
 * Anweisungen"), so the override rule keeps the English three-part ordering.
 *
 * `System-Prompt` is written with an optional hyphen throughout — German
 * compounds it both ways.
 */
export const DE_PATTERNS: InjectionPattern[] = [
	{
		id: ID.overrideIgnorePrior,
		lang: "de",
		category: "instruction_override",
		regex:
			/\b(ignorier|vergiss|vergesse|missacht|verwerf)\w*\b[^.\n]{0,40}\b(vorherig|vorhergehend|fr[üu]her|obig|oben)\w*\b[^.\n]{0,20}\b(anweisung|anleitung|regel|vorgab|prompt)\w*\b/i,
		weight: 30,
	},
	{
		id: ID.overrideNewInstructions,
		lang: "de",
		category: "instruction_override",
		regex:
			/\b(neue|neuen|aktualisierte|aktualisierten)\s+(anweisungen|anleitungen)\s*:/i,
		weight: 25,
	},
	{
		id: ID.roleYouAreNow,
		lang: "de",
		category: "role_reassignment",
		regex:
			/\b(du\s+bist|sie\s+sind)\s+(jetzt|nun|ab\s+sofort)\s+(ein|eine|der|die|das)\b/i,
		weight: 20,
	},
	{
		id: ID.roleActAs,
		lang: "de",
		category: "role_reassignment",
		regex: /\b(verhalte\s+dich|tu\s+so|gib\s+vor|handle)\s+(wie|als)\b/i,
		weight: 20,
	},
	{
		id: ID.leakRepeatInstructions,
		lang: "de",
		category: "prompt_leak",
		regex:
			/\b(wiederhole|zeige?|verrate|nenne)\b[^.\n]{0,20}\b(system-?prompt|deine anweisungen|deine regeln)\b/i,
		weight: 35,
	},
	{
		id: ID.leakWhatIsYourPrompt,
		lang: "de",
		category: "prompt_leak",
		regex:
			/\b(was|wie)\s+(ist|sind|lautet|lauten)\s+(dein|deine)\s+(system-?prompt|prompt|anweisungen|regeln)\b/i,
		weight: 35,
	},
];
