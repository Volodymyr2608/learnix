import type { InjectionPattern } from "./types";

const ID = {
	overrideIgnorePrior: "es:override-ignore-prior",
	overrideNewInstructions: "es:override-new-instructions",
	roleYouAreNow: "es:role-you-are-now",
	roleActAs: "es:role-act-as",
	leakRepeatInstructions: "es:leak-repeat-instructions",
	leakWhatIsYourPrompt: "es:leak-what-is-your-prompt",
} as const;

export const ES_RULE_IDS = Object.values(ID);

/**
 * Spanish variants of the six English prose families, at parity weights.
 * Stems (`ignor\w*`) rather than full forms, because Spanish is inflected and
 * enumerating conjugations is both unreadable and incomplete.
 *
 * Note the ordering: Spanish places the adjective AFTER the noun, so this rule
 * reads verb → noun → adjective where the English one reads
 * verb → adjective → noun.
 */
export const ES_PATTERNS: InjectionPattern[] = [
	{
		id: ID.overrideIgnorePrior,
		lang: "es",
		category: "instruction_override",
		regex:
			/\b(ignor|olvid|desestim|descart)\w*\b[^.\n]{0,40}\b(instruccion|indicacion|regl|prompt)\w*\b[^.\n]{0,20}\b(anterior|previ)\w*\b/i,
		weight: 30,
	},
	{
		id: ID.overrideNewInstructions,
		lang: "es",
		category: "instruction_override",
		regex: /\b(nuevas?|actualizadas?)\s+(instrucciones|indicaciones)\s*:/i,
		weight: 25,
	},
	{
		id: ID.roleYouAreNow,
		lang: "es",
		category: "role_reassignment",
		regex: /\b(ahora\s+eres|eres\s+ahora)\s+(un|una|el|la)\b/i,
		weight: 20,
	},
	{
		id: ID.roleActAs,
		lang: "es",
		category: "role_reassignment",
		regex: /\b(act[úu]a|comp[óo]rtate|finge)\s+(como|de)\s+(un|una|si)\b/i,
		weight: 20,
	},
	{
		id: ID.leakRepeatInstructions,
		lang: "es",
		category: "prompt_leak",
		regex:
			/\b(repite|revela|muestra|imprime|mu[ée]strame)\b[^.\n]{0,20}\b(prompt del sistema|tus instrucciones|tus reglas)\b/i,
		weight: 35,
	},
	{
		id: ID.leakWhatIsYourPrompt,
		lang: "es",
		category: "prompt_leak",
		regex:
			/\b(cu[áa]l|qu[ée])\s+(es|son)\s+(tu|tus)\s+(prompt|instrucciones|reglas)\b/i,
		weight: 35,
	},
];
