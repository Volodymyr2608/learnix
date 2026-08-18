/**
 * `<source src>` is the same zero-click off-origin fetch as an image, in the
 * same component whose images are now same-origin-only — a scheme-only
 * restriction would leave the beacon wide open.
 *
 * Enforced at the DTO (a write control) AND at render, because rows written
 * before the DTO existed were never parsed by it.
 *
 * Origin comparison, not hostname: hostname alone accepts
 * https://www.youtube.com:8443/… . Harmless in practice, same amount of code.
 *
 * Verified closed: userinfo (`https://www.youtube.com@evil.example/x` parses
 * with hostname "evil.example"), IDN homographs (URL normalises to punycode,
 * which is not in this ASCII list), and suffix tricks
 * (`youtube.com.evil.example`) — the match is exact on the full origin.
 *
 * NOT closed, and recorded as a residual: a redirect endpoint on an allowlisted
 * host (`https://www.youtube.com/redirect?q=…`) re-opens the off-origin fetch,
 * and `<source>` follows redirects. Path filtering is the only answer and is not
 * worth it here — but nothing may claim `<source>` is same-origin-constrained.
 */
export const ALLOWED_VIDEO_ORIGINS = [
	"https://www.youtube.com",
	"https://youtube.com",
	"https://youtu.be",
	"https://player.vimeo.com",
	"https://vimeo.com",
] as const;

export const isAllowedVideoUrl = (url: string): boolean => {
	try {
		return (ALLOWED_VIDEO_ORIGINS as readonly string[]).includes(
			new URL(url).origin,
		);
	} catch {
		return false;
	}
};
