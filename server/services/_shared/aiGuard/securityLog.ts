import { logger } from "@/server/utils/logger";
import type { SecurityEvent } from "./types";

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
		},
		`[aiGuard] ${event.outcome}`,
	);
};
