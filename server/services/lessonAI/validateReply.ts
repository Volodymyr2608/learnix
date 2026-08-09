import { env } from "@/lib/env";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { SYSTEM_PROMPT_LEAK_MARKERS } from "./promptLeakMarkers";
import type {
	ReplyValidationContext,
	ReplyValidationResult,
	ReplyValidationRuleId,
} from "./types";

/**
 * A markdown image loads without a click, so an off-origin destination is a
 * zero-interaction exfiltration channel (threat-model R2). CommonMark spells a
 * destination four ways and all four render, so all four are collected:
 *
 * - inline, optionally whitespace-padded and optionally followed by a title:
 *   `![x](  https://host/p  "title" )`
 * - pointy-bracket destination: `![x](<https://host/p>)`  (stripped below)
 * - reference definition on its own line: `[ref]: https://host/p`
 * - autolink: `<https://host/p>`
 *
 * Regexes are a pre-filter over text the renderer parses properly; the client's
 * `urlTransform` is the enforcement point that cannot drift from the renderer.
 * See `LessonAssistant/index.tsx`.
 */
const INLINE_LINK_OR_IMAGE = /!?\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;
const REFERENCE_DEFINITION = /^[ \t]*\[[^\]]+\]:[ \t]*(\S+)/gm;
const AUTOLINK = /<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi;

/**
 * A run this long reproduced word for word is a dump, not a quotation.
 *
 * Detection is guaranteed only for runs of `VERBATIM_RUN + VERBATIM_STEP - 1`
 * characters (87): a shorter run can fall between two window starts. Anything
 * under `VERBATIM_RUN` is never checked at all. Exact substring matching also
 * means reformatting (re-wrapping, bulletising) defeats the check — this is a
 * dump detector, not a paraphrase detector.
 */
const VERBATIM_RUN = 80;
const VERBATIM_STEP = 8;

const stripWrapperTags = (value: string): string =>
	value.replace(/<\/?untrusted_data[^>]*>/g, "");

const containsSystemPromptLeak = (reply: string): boolean => {
	const haystack = reply.toLowerCase();
	return SYSTEM_PROMPT_LEAK_MARKERS.some((marker) =>
		haystack.includes(marker.toLowerCase()),
	);
};

const containsUntrustedDataEcho = (reply: string): boolean => {
	// Lowercased for the same reason the marker check is: the tag is markup the
	// model reproduces, and it does not always reproduce the casing.
	const haystack = reply.toLowerCase();
	return (
		haystack.includes("<untrusted_data") ||
		haystack.includes("</untrusted_data")
	);
};

const containsVerbatimChunk = (
	reply: string,
	retrievedContent: string[],
): boolean =>
	retrievedContent.some((raw) => {
		const content = stripWrapperTags(raw);
		for (
			let start = 0;
			start + VERBATIM_RUN <= content.length;
			start += VERBATIM_STEP
		) {
			if (reply.includes(content.slice(start, start + VERBATIM_RUN)))
				return true;
		}
		return false;
	});

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * `[x](<https://host/p>)` is one destination, not a destination wrapped in an
 * autolink. Without stripping, the leading "<" defeats the scheme test and an
 * off-origin host reads as relative.
 */
const stripAngleBrackets = (href: string): string =>
	href.startsWith("<") && href.endsWith(">") ? href.slice(1, -1) : href;

const isOffOrigin = (href: string): boolean => {
	// Protocol-relative: "//evil.example.com" inherits the scheme but not the host.
	if (href.startsWith("//")) return true;
	// A href with no scheme cannot leave the app, whatever BASE_URL is set to.
	// Deciding this structurally rather than by resolving against BASE_URL keeps
	// in-app links working under a misconfigured or relative BASE_URL — which is
	// also the value Vitest injects, so the plan's resolve-against-BASE_URL form
	// rejected every relative href.
	if (!HAS_SCHEME.test(href)) return false;
	try {
		return new URL(href).origin !== new URL(env.BASE_URL).origin;
	} catch {
		return true; // unparseable, or BASE_URL is not absolute → fail closed
	}
};

const collectHrefs = (reply: string): string[] =>
	[INLINE_LINK_OR_IMAGE, REFERENCE_DEFINITION, AUTOLINK].flatMap((pattern) =>
		[...reply.matchAll(pattern)].map((match) =>
			stripAngleBrackets(match[1] ?? ""),
		),
	);

const containsOffOriginLink = (reply: string): boolean =>
	collectHrefs(reply).some(isOffOrigin);

const reject = (
	ctx: ReplyValidationContext,
	ruleId: ReplyValidationRuleId,
): ReplyValidationResult => {
	logSecurityEvent({
		feature: "lessonAI",
		userId: ctx.userId,
		layer: "output_validation",
		outcome: "output_validation_failed",
		ruleIds: [ruleId],
		score: 0,
	});
	return { valid: false, ruleId };
};

/**
 * Fail-closed check over the assembled reply. Deliberately does NOT catch its
 * own exceptions: lessonAI.service.ts treats a throw exactly like a returned
 * rejection, per spec ("the validator throwing counts as a rejection").
 */
export const validateReply = (
	reply: string,
	ctx: ReplyValidationContext,
): ReplyValidationResult => {
	if (containsSystemPromptLeak(reply)) return reject(ctx, "system_prompt_echo");
	if (containsUntrustedDataEcho(reply))
		return reject(ctx, "untrusted_data_echo");
	if (containsVerbatimChunk(reply, ctx.retrievedContent)) {
		return reject(ctx, "verbatim_chunk_echo");
	}
	if (containsOffOriginLink(reply)) return reject(ctx, "off_origin_link");
	return { valid: true };
};
