/**
 * One answer to "does this destination leave the app", shared by the server-side
 * output boundary (`_shared/aiOutput/checks.ts`) and the client-side render
 * policy. Two implementations of one decision is its own drift risk, so this
 * module takes the origin as an argument and imports nothing: the server passes
 * `env.BASE_URL`, the browser passes `window.location.origin`.
 */

export const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * `[x](<https://host/p>)` is one destination, not a destination wrapped in an
 * autolink. Without stripping, the leading "<" defeats the scheme test and an
 * off-origin host reads as relative.
 */
export const stripAngleBrackets = (href: string): string =>
	href.startsWith("<") && href.endsWith(">") ? href.slice(1, -1) : href;

/**
 * `appOrigin` may be null when the caller has no origin to compare against
 * (server prerender of a client component, for one). A null origin means only
 * structural judgements are available: a scheme or a protocol-relative prefix is
 * off-origin, everything else is not.
 */
export const isOffOrigin = (
	href: string,
	appOrigin: string | null,
): boolean => {
	// Protocol-relative: "//evil.example.com" inherits the scheme but not the host.
	if (href.startsWith("//")) return true;
	// A href with no scheme cannot leave the app, whatever the origin is. Deciding
	// this structurally rather than by resolving against the origin keeps in-app
	// links working under a misconfigured or relative origin.
	if (!HAS_SCHEME.test(href)) return false;
	if (!appOrigin) return true;
	try {
		return new URL(href).origin !== new URL(appOrigin).origin;
	} catch {
		return true; // unparseable, or the origin is not absolute → fail closed
	}
};
