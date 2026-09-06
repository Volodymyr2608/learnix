import { reportMessage } from "@/server/observability/reportError";
import { logger } from "@/server/utils/logger";
import type { SecurityEvent, SecurityOutcome } from "./types";

/**
 * Which SecurityOutcome values get an explicit Sentry forward (AC 36/37).
 *
 * A total Record, not an array with `.includes()`: SecurityOutcome has exactly
 * nine members today, and a tenth added to the union makes this object literal
 * fail to type-check until someone classifies it (AC 37a). An array would
 * silently treat an unclassified outcome as "not forwarded" — the safe
 * direction, but not the point; the point is to force the decision.
 */
const FORWARD_TO_SENTRY: Record<SecurityOutcome, boolean> = {
	// Zero-baseline: normal rate is zero, so any occurrence is the signal.
	unsafe_tool_call: true,
	fallback_triggered: true,
	content_revised_retained: true,
	// Rate-based and attacker-triggerable — forwarding would hand out the
	// throttle's quota lever (AC 24).
	guard_blocked: false,
	guard_suspect: false,
	guard_off_topic: false,
	// The successful path, one event per completed lesson: forwarding it would
	// flood Sentry with normal behaviour. Nothing consumes it yet (security.md
	// S10 item 4) — it is evidence for a later investigation, not detection.
	mastery_promoted: false,
	// Normal operation: a student who already has a question waiting, or a lesson
	// whose insights have not generated. Its baseline is NOT zero, which is
	// precisely why it exists as its own outcome.
	tool_call_declined: false,
	// Report-only, ~10% measured false-positive rate over every persisted
	// model-authored field — conformance/aiSurfaces.ts:72. Highest-volume
	// outcome in the taxonomy; forwarding it is the S6 flood pattern.
	output_validation_failed: false,
};

/**
 * The one place a security event is written.
 *
 * The field set is exhaustive by type: there is no field to pass message text,
 * reply text, or a concept name into. That is the enforcement mechanism for
 * "no event carries free text" — not a redaction step that can be forgotten.
 */
export const logSecurityEvent = (event: SecurityEvent): void => {
	logger.warn(
		{
			feature: event.feature,
			userId: event.userId,
			layer: event.layer,
			outcome: event.outcome,
			ruleIds: event.ruleIds,
			score: event.score,
			...(event.subject ? { subject: event.subject } : {}),
			...(event.decoders?.length ? { decoders: event.decoders } : {}),
		},
		`[aiGuard] ${event.outcome}`,
	);

	if (FORWARD_TO_SENTRY[event.outcome]) {
		// The forward is telemetry; the caller is an authorization decision.
		// This function runs synchronously inside `deny()`, which runs inside the
		// tool, so a throwing sink would not merely lose an event — it would
		// propagate out of the policy and fail the student's turn. The alert path
		// must not be able to break the path it is watching.
		//
		// The event itself is already in the log line above, so nothing is lost
		// but the Sentry copy, and that loss is reported rather than swallowed.
		try {
			reportMessage(`aiGuard:${event.outcome}`, ["aiGuard", event.outcome], {
				feature: event.feature,
				userId: event.userId,
			});
		} catch (error) {
			// `warn`, not `error`: the error level forwards to the same sink that
			// just failed (logger.ts routes it through reportError), so reporting
			// the failure there re-enters the broken path and throws out of the
			// catch that exists to prevent exactly that.
			logger.warn(
				{ err: error instanceof Error ? error.name : "unknown" },
				"[aiGuard] security event could not be forwarded",
			);
		}
	}
};
