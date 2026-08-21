import type { InjectionPattern } from "./types";

/**
 * Rules that match payload STRUCTURE rather than prose, so they fire in every
 * language and carry no language prefix. Their ids are their own identities.
 */
const ID = {
	markupFakeTokens: "markup-fake-tokens",
	markupInjectedTags: "markup-injected-tags",
	roleSystemMarker: "role-system-marker",
	jailbreakDanToken: "jailbreak-dan-token",
} as const;

export const UNIVERSAL_RULE_IDS = Object.values(ID);

export const UNIVERSAL_PATTERNS: InjectionPattern[] = [
	{
		id: ID.markupFakeTokens,
		lang: "universal",
		category: "structure_markup",
		regex: /<\|(im_start|im_end|system|endoftext)\|>/i,
		weight: 45,
	},
	{
		id: ID.markupInjectedTags,
		lang: "universal",
		category: "structure_markup",
		regex: /<\/?(system|instructions|untrusted_data)\b[^>]*>/i,
		weight: 45,
	},
	{
		// A protocol marker, not prose: a line beginning "system:" is the same
		// attack whatever language the rest of the message is in.
		id: ID.roleSystemMarker,
		lang: "universal",
		category: "role_reassignment",
		regex: /^\s*(system|assistant)\s*:/im,
		weight: 30,
	},
	{
		// The fixed-token half of the old `jailbreak-dan`. "DAN mode" is a proper
		// noun that survives translation; the prose half ("do anything now") does
		// not and lives in en.ts. See security.md S6.
		id: ID.jailbreakDanToken,
		lang: "universal",
		category: "jailbreak_template",
		regex: /\bDAN\s+mode\b/i,
		weight: 40,
	},
];