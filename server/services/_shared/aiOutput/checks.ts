import { env } from "@/lib/env";
import { isOffOrigin, stripAngleBrackets } from "@/lib/url/origin";
import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import { SYSTEM_PROMPT_LEAK_MARKERS } from "./leakMarkers";

/**
 * The three checks that hold on any surface, whatever it generates. They are
 * module-private on purpose: every caller goes through `validateModelText`, so
 * the throw-to-rejection conversion and the single security event exist in one
 * place and cannot be skipped by calling a check directly (AC 4).
 *
 * A markdown image loads without a click, so an off-origin destination is a
 * zero-interaction exfiltration channel. CommonMark spells a destination four
 * ways and all four render, so all four are collected:
 *
 * - inline, optionally whitespace-padded and optionally followed by a title:
 *   `![x](  https://host/p  "title" )`
 * - pointy-bracket destination: `![x](<https://host/p>)`  (stripped below)
 * - reference definition on its own line: `[ref]: https://host/p`
 * - autolink: `<https://host/p>`
 *
 * Regexes are a pre-filter over text a renderer parses properly; the client's
 * `urlTransform` is the enforcement point that cannot drift from the renderer.
 */
const INLINE_LINK_OR_IMAGE = /!?\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;
const REFERENCE_DEFINITION = /^[ \t]*\[[^\]]+\]:[ \t]*(\S+)/gm;
const AUTOLINK = /<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi;

export const containsSystemPromptLeak = (
	text: string,
	feature: AiFeature,
): boolean => {
	const haystack = text.toLowerCase();
	return SYSTEM_PROMPT_LEAK_MARKERS[feature].some((marker) =>
		haystack.includes(marker.toLowerCase()),
	);
};

export const containsUntrustedDataEcho = (text: string): boolean => {
	// Lowercased for the same reason the marker check is: the tag is markup the
	// model reproduces, and it does not always reproduce the casing.
	const haystack = text.toLowerCase();
	return (
		haystack.includes("<untrusted_data") ||
		haystack.includes("</untrusted_data")
	);
};

const collectHrefs = (text: string): string[] =>
	[INLINE_LINK_OR_IMAGE, REFERENCE_DEFINITION, AUTOLINK].flatMap((pattern) =>
		[...text.matchAll(pattern)].map((match) =>
			stripAngleBrackets(match[1] ?? ""),
		),
	);

export const containsOffOriginLink = (text: string): boolean =>
	collectHrefs(text).some((href) => isOffOrigin(href, env.BASE_URL));
