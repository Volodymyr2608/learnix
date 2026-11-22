import {
	REFUND_CONDITIONS,
	type RefundCondition,
	type RefundDecisionResult,
	type RefundFacts,
} from "@/server/entities/refund/refund.dto";

/** A3: 14 × 24 h from Payment.paidAt, in UTC. */
export const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** OQ-2: fewer than this many account-limit refunds in 12 months. */
export const ACCOUNT_LIMIT = 3;

/** Q13: min(3, ⌊L/2⌋) opened lessons. */
export const refundThreshold = (lessonCount: number): number =>
	Math.min(3, Math.floor(lessonCount / 2));

/** P4: an unknown payment time is outside the window (fail closed). */
export const isInsideRefundWindow = (paidAt: Date | null, now: Date): boolean =>
	paidAt !== null && now.getTime() < paidAt.getTime() + REFUND_WINDOW_MS;

export const decideRefund = (
	facts: RefundFacts,
	now: Date,
): RefundDecisionResult => {
	const threshold = refundThreshold(facts.lessonCount);
	const conditions: Record<RefundCondition, boolean> = {
		window: isInsideRefundWindow(facts.paidAt, now),
		threshold: facts.openedCount <= threshold,
		certificate: !facts.hasCertificate,
		earlier_refund: !facts.hasEarlierCountingRefund,
		account_limit: facts.accountLimitRefunds12m < ACCOUNT_LIMIT,
		dispute: !facts.hasOpenDispute,
	};
	const failedConditions = REFUND_CONDITIONS.filter((c) => !conditions[c]);

	return {
		decision: failedConditions.length === 0 ? "auto_approved" : "auto_denied",
		failedConditions,
		snapshot: {
			...facts,
			paidAt: facts.paidAt?.toISOString() ?? null,
			windowEndsAt: facts.paidAt
				? new Date(facts.paidAt.getTime() + REFUND_WINDOW_MS).toISOString()
				: null,
			evaluatedAt: now.toISOString(),
			threshold,
			conditions,
		},
	};
};
