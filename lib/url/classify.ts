import { appOrigin } from "./origin";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export type UrlKind = "in_app" | "off_origin" | "drop";

/**
 * A positive protocol allowlist BEFORE any origin comparison. Overriding
 * react-markdown's `urlTransform` REMOVES its defaultUrlTransform, which is what
 * blocks `javascript:` and `data:` today. Relying on
 * `new URL("javascript:x").origin === "null"` is an accident rather than a
 * decision, and it is outright wrong for `blob:`.
 */
export const classifyUrl = (url: string): UrlKind => {
	// Protocol-relative: inherits our scheme but not our host.
	if (url.startsWith("//")) return "drop";
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
