import type {
	PurchaseRefundRowState,
	PurchaseRowFacts,
	RefundOverLimit,
	RefundPageFacts,
	RefundPageState,
	RefundRequestStatus,
	RefundRequestView,
} from "@/server/entities/refund/refundView.dto";
import { appealDeadline } from "./appealRules";
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
	request: {
		decision: RefundRequestView["decision"];
		refundState: RefundRequestView["refundState"];
		appeal: { status: string } | null;
	},
	paymentRefunded: boolean,
): RefundRequestStatus => {
	if (request.appeal?.status === "open") return "under_review";
	// Review I3: the money went back another way (exception, Dashboard) after a denial.
	if (paymentRefunded) return "refunded";
	if (request.appeal?.status === "denied") return "denied";
	if (request.decision !== "auto_approved" && request.refundState === null)
		return "denied";
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
		return {
			kind: "status",
			status: requestStatus(facts.request, facts.paymentRefunded),
		};
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

/** FR-S14, S16: a denied request with no appeal yet can be appealed until its deadline. */
const openAppealDeadline = (
	request: RefundRequestView,
	paidAt: Date | null,
	now: Date,
): Date | null => {
	if (request.decision !== "auto_denied" || request.appeal) return null;
	const deadline = appealDeadline({
		kind: "after_denial",
		paidAt,
		deniedAt: request.createdAt,
	});
	return deadline && now < deadline ? deadline : null;
};

/** U3: the request's own status; dispute; certificate; earlier refund; window; limits; the form. */
export const refundPageState = (
	facts: RefundPageFacts,
	now: Date,
): RefundPageState => {
	const { request } = facts;
	if (request) {
		const status = requestStatus(request, facts.paymentRefunded);
		const appeal = request.appeal;
		return {
			kind: "status",
			status,
			amountCents: facts.amountCents,
			currency: facts.currency,
			reason: request.reason,
			text: request.text,
			submittedAt: appeal?.createdAt ?? request.createdAt,
			refundedAt: request.refundedAt,
			failedConditions: request.failedConditions,
			appealDeadline: facts.paymentRefunded
				? null
				: openAppealDeadline(request, facts.paidAt, now),
			adminDecision:
				appeal?.status === "denied"
					? {
							reason: appeal.denialReason ?? "",
							files: appeal.files.filter((f) => f.uploadedBy === "admin"),
						}
					: null,
			studentFiles:
				appeal?.files.filter((f) => f.uploadedBy === "student") ?? [],
		};
	}
	if (facts.paymentRefunded) return { kind: "payment_refunded" };
	if (facts.hasOpenDispute) return { kind: "dispute" };
	if (facts.hasCertificate) return { kind: "certificate" };
	if (facts.hasEarlierCountingRefund) return { kind: "already_refunded" };
	const windowEndsAt = refundWindowEndsAt(facts.paidAt);
	if (windowEndsAt === null || !isInsideRefundWindow(facts.paidAt, now))
		return { kind: "window_closed", endedAt: windowEndsAt };
	const exceeded = overLimit(facts);
	if (exceeded.length > 0)
		return { kind: "over_limit", exceeded, appealDeadline: windowEndsAt };
	return {
		kind: "form",
		amountCents: facts.amountCents,
		currency: facts.currency,
		windowEndsAt,
	};
};
