import { DomainError } from "@/server/services/base/base.errors";
import { NEUTRAL_REFUSAL_MESSAGE } from "./messages";

/**
 * For tRPC-routed callers only. The two SSE chat routes branch on GuardResult
 * directly — they are raw Route Handlers, so handleServiceError (ADR-010)
 * never sees their exceptions.
 */
export class AiGuardBlockedError extends DomainError {
	constructor(context?: Record<string, unknown>) {
		super(NEUTRAL_REFUSAL_MESSAGE, "BAD_REQUEST", undefined, context);
	}
}
