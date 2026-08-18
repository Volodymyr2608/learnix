import { classifyUrl, normaliseUrl } from "@/lib/url";
import type { UrlPolicy } from "./types";

/**
 * Two policies, because the two kinds of content carry different risk.
 *
 * A markdown image loads without a click, so an off-origin `src` is a
 * zero-interaction exfiltration channel: the reader's IP, referrer and the mere
 * fact they opened the lesson reach a third party. An off-origin `href` costs a
 * deliberate click and is ordinary course material — a link to MDN is what
 * teaching looks like.
 *
 * Model-authored text gets neither: nothing the model writes needs to point off
 * this origin, and everything it might point at came from content it was told
 * to treat as data.
 *
 * Overriding `urlTransform` REMOVES react-markdown's defaultUrlTransform, which
 * is what blocks `javascript:` and `data:` today — hence the positive protocol
 * allowlist inside `classifyUrl`, applied before any origin comparison.
 */

/** True when this node loads without the reader doing anything. */
const isImageLike = (node: Parameters<UrlPolicy>[2], key: string): boolean => {
	if (key === "src") return true;
	const tag = (node as { tagName?: string } | null | undefined)?.tagName;
	return tag === "img" || tag === "image" || tag === "video";
};

/**
 * Instructor- and student-authored markdown: off-origin links survive, images
 * do not.
 */
export const authoredContentUrlPolicy: UrlPolicy = (url, key, node) => {
	// Hand back the NORMALISED value: the string that was judged must be the
	// string that renders, or a leading tab lets the browser resolve something
	// the policy never saw.
	const safe = normaliseUrl(url);
	const kind = classifyUrl(url);
	if (kind === "drop") return undefined;
	if (kind === "in_app") return safe;
	return isImageLike(node, key) ? undefined : safe;
};

/** Model-authored markdown: nothing off-origin renders at all. */
export const modelOutputUrlPolicy: UrlPolicy = (url) =>
	classifyUrl(url) === "in_app" ? normaliseUrl(url) : undefined;

export { isOffOrigin } from "@/lib/url";
