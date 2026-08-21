/** The four languages the course catalogue offers. */
export type PatternLang = "en" | "es" | "fr" | "de";

/**
 * A rule is either prose in one language, or structural and therefore
 * language-independent. The partition must be exhaustive — see AC-8 and the
 * contract test in patterns.contract.test.ts.
 */
export type PatternScope = PatternLang | "universal";

export type PatternCategory =
	| "instruction_override"
	| "role_reassignment"
	| "prompt_leak"
	| "structure_markup"
	| "jailbreak_template";

export type InjectionPattern = {
	id: string;
	/** Drives the AC-8 partition and documents why a rule is or isn't translated. */
	lang: PatternScope;
	category: PatternCategory;
	regex: RegExp;
	weight: number;
};
