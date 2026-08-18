import { appOrigin } from "./origin";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export type UrlKind = "in_app" | "off_origin" | "drop";

/**
 * What the WHATWG URL parser does before it looks at the scheme: strip leading
 * and trailing C0 controls and spaces, then remove every ASCII tab, CR and LF
 * from anywhere in the string.
 *
 * Without this, `" javascript:x"` and `"\thttps://evil.example/beacon.png"` fail
 * an anchored scheme test, classify as in-app, and are handed back untouched —
 * and the browser then strips exactly these characters and resolves the absolute
 * URL the policy just decided was relative. One root cause defeating both the
 * client render policy and the server-side output boundary.
 */
export const normaliseUrl = (url: string): string => {
	// Trim leading and trailing C0 controls and spaces...
	let start = 0;
	let end = url.length;
	while (start < end && url.charCodeAt(start) <= 0x20) start++;
	while (end > start && url.charCodeAt(end - 1) <= 0x20) end--;

	// ...then drop tab, LF and CR from anywhere, which is what splits a scheme.
	// Written with character codes rather than a regex: a control-character
	// class is exactly what Biome's noControlCharactersInRegex warns about, and
	// the intent reads better spelled out.
	return [...url.slice(start, end)]
		.filter((char) => {
			const code = char.charCodeAt(0);
			return code !== 9 && code !== 10 && code !== 13;
		})
		.join("");
};

/**
 * A positive protocol allowlist BEFORE any origin comparison. Overriding
 * react-markdown's `urlTransform` REMOVES its defaultUrlTransform, which is what
 * blocks `javascript:` and `data:` today. Relying on
 * `new URL("javascript:x").origin === "null"` is an accident rather than a
 * decision, and it is outright wrong for `blob:`.
 */
export const classifyUrl = (rawUrl: string): UrlKind => {
	const url = normaliseUrl(rawUrl);

	// Protocol-relative: inherits our scheme but not our host. `/\` resolves the
	// same way in every browser, so it is the same case.
	if (url.startsWith("//") || url.startsWith("/\\")) return "drop";
	// "/x", "#a", "?q=1" — cannot leave the app.
	if (!HAS_SCHEME.test(url)) return "in_app";

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return "drop";
	}

	if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return "drop";
	return parsed.origin === appOrigin() ? "in_app" : "off_origin";
};

/**
 * True only for an ALLOWED scheme pointing off-origin. A `javascript:` URL is
 * "drop", not off-origin — a caller that gates on this predicate alone would
 * wave every dangerous scheme through.
 */
export const isOffOrigin = (url: string): boolean =>
	classifyUrl(url) === "off_origin";

/** True when the scheme is permitted at all — the predicate a DTO needs. */
export const hasSafeScheme = (url: string): boolean =>
	classifyUrl(url) !== "drop";
