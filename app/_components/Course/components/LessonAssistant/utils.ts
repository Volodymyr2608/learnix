const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Drops any href/src in an assistant message that does not resolve to our own
 * origin.
 *
 * This is the enforcement point for the "no off-origin link" rule, not
 * `validateReply` — it runs on the AST the renderer actually uses, so it cannot
 * be defeated by a CommonMark spelling the server's regexes do not know about,
 * and it also covers the paths that never reach `validateReply` at all (the
 * off-topic refusal, which interpolates the instructor's course title).
 *
 * A markdown image loads with no click, so a permitted off-origin URL is a
 * zero-interaction exfiltration channel — see threat-model R2.
 */
export const inAppUrlTransform = (url: string): string | undefined => {
	// Protocol-relative: inherits our scheme but not our host.
	if (url.startsWith("//")) return undefined;
	// No scheme means it cannot leave the app. Covers "/dashboard/x", "#anchor"
	// and "?q=1". react-markdown's own default would allow these too.
	if (!HAS_SCHEME.test(url)) return url;
	try {
		return new URL(url).origin === window.location.origin ? url : undefined;
	} catch {
		return undefined; // unparseable → drop
	}
};
