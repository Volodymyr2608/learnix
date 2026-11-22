import type {
	PurchaseRefundRowState,
	PurchaseRowFacts,
	RefundOverLimit,
	RefundPageFacts,
	RefundPageState,
	RefundRequestStatus,
	RefundRequestView,
} from "@/server/entities/refund/refundView.dto";
import {
	ACCOUNT_LIMIT,
	isInsideRefundWindow,
	REFUND_WINDOW_MS,
	refundThreshold,
} from "./refundRules";

/**
 * U1 — what the student sees, decided on the server from the same facts and rules the request
 * path uses (`refundRules.ts`). The UI only switches on `kind`.
 */

export const refundWindowEndsAt = (paidAt: Date | null): Date | null =>
	paidAt ? new Date(paidAt.getTime() + REFUND_WINDOW_MS) : null;

const requestStatus = (
	request: Pick<RefundRequestView, "decision" | "refundState">,
): RefundRequestStatus => {
	if (request.decision === "auto_denied") return "denied";
	if (
		request.refundState === "refunded" ||
		request.refundState === "refunded_by_bank"
	)
		return "refunded";
	return "processing";
};

/** U2: the request's status first; then the facts that hide the action; else the action. */
export const purchaseRefundRowState = (
	facts: PurchaseRowFacts,
	now: Date,
): PurchaseRefundRowState => {
	if (facts.request)
		return { kind: "status", status: requestStatus(facts.request) };
	const windowEndsAt = refundWindowEndsAt(facts.paidAt);
	if (
		facts.paymentRefunded ||
		facts.hasOpenDispute ||
		facts.hasCertificate ||
		facts.hasEarlierCountingRefund ||
		windowEndsAt === null ||
		!isInsideRefundWindow(facts.paidAt, now)
	)
		return { kind: "none" };
	return { kind: "request", windowEndsAt };
};

const overLimit = (facts: RefundPageFacts): RefundOverLimit[] => {
	const threshold = refundThreshold(facts.lessonCount);
	const exceeded: RefundOverLimit[] = [];
	if (facts.openedCount > threshold)
		exceeded.push({
			condition: "threshold",
			openedCount: facts.openedCount,
			threshold,
		});
	if (facts.accountLimitRefunds12m >= ACCOUNT_LIMIT)
		exceeded.push({
			condition: "account_limit",
			refunds: facts.accountLimitRefunds12m,
			limit: ACCOUNT_LIMIT,
		});
	return exceeded;
};

/** U3: the request's own status; dispute; certificate; earlier refund; window; limits; the form. */
export const refundPageState = (
	facts: RefundPageFacts,
	now: Date,
): RefundPageState => {
	const { request } = facts;
	if (request)
		return {
			kind: "status",
			status: requestStatus(request),
			amountCents: facts.amountCents,
			currency: facts.currency,
			reason: request.reason,
			text: request.text,
			submittedAt: request.createdAt,
			refundedAt: request.refundedAt,
			failedConditions: request.failedConditions,
		};
	if (facts.paymentRefunded) return { kind: "payment_refunded" };
	if (facts.hasOpenDispute) return { kind: "dispute" };
	if (facts.hasCertificate) return { kind: "certificate" };
	if (facts.hasEarlierCountingRefund) return { kind: "already_refunded" };
	const windowEndsAt = refundWindowEndsAt(facts.paidAt);
	if (windowEndsAt === null || !isInsideRefundWindow(facts.paidAt, now))
		return { kind: "window_closed", endedAt: windowEndsAt };
	const exceeded = overLimit(facts);
	if (exceeded.length > 0) return { kind: "over_limit", exceeded };
	return {
		kind: "form",
		amountCents: facts.amountCents,
		currency: facts.currency,
		windowEndsAt,
	};
};
