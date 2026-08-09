import { env } from "@/lib/env";
import { logSecurityEvent } from "@/server/services/_shared/aiGuard/securityLog";
import { SYSTEM_PROMPT_LEAK_MARKERS } from "./lessonAI.agent";
import type {
	ReplyValidationContext,
	ReplyValidationResult,
	ReplyValidationRuleId,
} from "./types";

const MARKDOWN_LINK_OR_IMAGE = /!?\[[^\]]*\]\(([^)\s]+)\)/g;

/**
 * A run this long reproduced word for word is a dump, not a quotation. Short
 * enough to catch a pasted paragraph, long enough that a legitimately quoted
 * definition or term does not trip it.
 */
const VERBATIM_RUN = 80;
const VERBATIM_STEP = 40;

const stripWrapperTags = (value: string): string =>
	value.replace(/<\/?untrusted_data[^>]*>/g, "");

const containsSystemPromptLeak = (reply: string): boolean => {
	const haystack = reply.toLowerCase();
	return SYSTEM_PROMPT_LEAK_MARKERS.some((marker) =>
		haystack.includes(marker.toLowerCase()),
	);
};

const containsUntrustedDataEcho = (reply: string): boolean =>
	reply.includes("<untrusted_data") || reply.includes("</untrusted_data");

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

const isOffOrigin = (href: string): boolean => {
	// Protocol-relative: "//evil.example.com" inherits the scheme but not the host.
	if (href.startsWith("//")) return true;
	// A href with no scheme cannot leave the app, whatever BASE_URL is set to.
	// Deciding this structurally rather than by resolving against BASE_URL keeps
	// in-app links working under a misconfigured or relative BASE_URL.
	if (!HAS_SCHEME.test(href)) return false;
	try {
		return new URL(href).origin !== new URL(env.BASE_URL).origin;
	} catch {
		return true; // unparseable, or BASE_URL is not absolute → fail closed
	}
};

const containsOffOriginLink = (reply: string): boolean =>
	[...reply.matchAll(MARKDOWN_LINK_OR_IMAGE)].some((match) =>
		isOffOrigin(match[1] ?? ""),
	);

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
