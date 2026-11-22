import type {
	RefundDecision,
	RefundReason,
	RefundState,
} from "@/generated/prisma";
import type { RefundCondition } from "./refund.dto";

/** The parts of a stored request the student may see (C23: never `refundError` or Stripe ids). */
export type RefundRequestView = {
	decision: RefundDecision;
	refundState: RefundState | null;
	failedConditions: RefundCondition[];
	reason: RefundReason;
	text: string | null;
	createdAt: Date;
	refundedAt: Date | null;
};

/** FR-S12: the statuses a row shows instead of the action. "Under review" arrives with appeals. */
export type RefundRequestStatus = "processing" | "refunded" | "denied";

/** What the Purchases row needs (U2) — no opened-lesson or account-limit counts. */
export type PurchaseRowFacts = {
	paidAt: Date | null;
	/** The payment is `refunded`, by any path. */
	paymentRefunded: boolean;
	hasCertificate: boolean;
	hasEarlierCountingRefund: boolean;
	hasOpenDispute: boolean;
	request: Pick<RefundRequestView, "decision" | "refundState"> | null;
};

export type PurchaseRefundRowState =
	| { kind: "request"; windowEndsAt: Date }
	| { kind: "status"; status: RefundRequestStatus }
	| { kind: "none" };

/** What the refund page needs: the row facts plus the counts and the amount. */
export type RefundPageFacts = Omit<PurchaseRowFacts, "request"> & {
	lessonCount: number;
	openedCount: number;
	accountLimitRefunds12m: number;
	amountCents: number;
	currency: string;
	request: RefundRequestView | null;
};

export type RefundOverLimit =
	| { condition: "threshold"; openedCount: number; threshold: number }
	| { condition: "account_limit"; refunds: number; limit: number };

export type RefundPageState =
	| { kind: "form"; amountCents: number; currency: string; windowEndsAt: Date }
	| {
			kind: "status";
			status: RefundRequestStatus;
			amountCents: number;
			currency: string;
			reason: RefundReason;
			text: string | null;
			submittedAt: Date;
			refundedAt: Date | null;
			failedConditions: RefundCondition[];
	  }
	| { kind: "payment_refunded" }
	| { kind: "dispute" }
	| { kind: "certificate" }
	| { kind: "already_refunded" }
	| { kind: "window_closed"; endedAt: Date | null }
	| { kind: "over_limit"; exceeded: RefundOverLimit[] };
