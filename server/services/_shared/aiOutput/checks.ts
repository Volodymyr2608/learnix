import { classifyUrl, stripAngleBrackets } from "@/lib/url";
import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import { leakMarkersFor } from "./promptLeakMarkers";

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
	return leakMarkersFor(feature).some((marker) =>
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

/**
 * Markdown decodes character references in a link destination, so the renderer
 * sees `\thttps://evil.example/x` where this scanner sees `&#9;https://...`.
 * Undecoded, that destination starts with `&`, fails the scheme test and reads
 * as in-app — the server missing exactly what the client would then load.
 * Only numeric references matter here: they are the ones that can produce the
 * leading whitespace that hides a scheme.
 */
const decodeNumericRefs = (href: string): string =>
	href.replace(/&#(x)?([0-9a-f]+);?/gi, (whole, hex, digits) => {
		const code = Number.parseInt(digits, hex ? 16 : 10);
		return Number.isFinite(code) && code > 0 && code <= 0x10ffff
			? String.fromCodePoint(code)
			: whole;
	});

const collectHrefs = (text: string): string[] =>
	[INLINE_LINK_OR_IMAGE, REFERENCE_DEFINITION, AUTOLINK].flatMap((pattern) =>
		[...text.matchAll(pattern)].map((match) =>
			decodeNumericRefs(stripAngleBrackets(match[1] ?? "")),
		),
	);

/**
 * Flags any destination that is not in-app: another origin, a protocol-relative
 * host, or a scheme outside the allowlist. `isOffOrigin` alone would be wrong
 * here — it answers "allowed scheme, different origin", so `javascript:` and
 * `//evil.example.com` would both read as false and sail through.
 */
export const containsOffOriginLink = (text: string): boolean =>
	collectHrefs(text).some((href) => classifyUrl(href) !== "in_app");
