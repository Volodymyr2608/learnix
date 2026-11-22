import type {
	AppealStatus,
	RefundDecision,
	RefundReason,
	RefundState,
} from "@/generated/prisma";
import type { RefundCondition } from "./refund.dto";

/** An evidence file as the student sees it: downloaded through the authorizing route (C20). */
export type EvidenceFileView = {
	id: string;
	fileName: string;
	uploadedBy: "student" | "admin";
};

/** The parts of a stored appeal the student may see (FR-S17, FR-S18). */
export type RefundAppealView = {
	status: AppealStatus;
	createdAt: Date;
	denialReason: string | null;
	files: EvidenceFileView[];
};

/** The parts of a stored request the student may see (C23: never `refundError` or Stripe ids). */
export type RefundRequestView = {
	decision: RefundDecision;
	refundState: RefundState | null;
	failedConditions: RefundCondition[];
	reason: RefundReason;
	text: string | null;
	createdAt: Date;
	refundedAt: Date | null;
	appeal: RefundAppealView | null;
};

/** FR-S12, S17: the statuses a row shows instead of the action. */
export type RefundRequestStatus =
	| "processing"
	| "refunded"
	| "denied"
	| "under_review";

/** What the Purchases row needs (U2) — no opened-lesson or account-limit counts. */
export type PurchaseRowFacts = {
	paidAt: Date | null;
	/** The payment is `refunded`, by any path. */
	paymentRefunded: boolean;
	hasCertificate: boolean;
	hasEarlierCountingRefund: boolean;
	hasOpenDispute: boolean;
	request:
		| (Pick<RefundRequestView, "decision" | "refundState"> & {
				appeal: Pick<RefundAppealView, "status"> | null;
		  })
		| null;
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
			/** FR-S14, S16: set while a denied request can still be appealed. */
			appealDeadline: Date | null;
			/** FR-S18: the admin's reason and files after a denied appeal. */
			adminDecision: { reason: string; files: EvidenceFileView[] } | null;
			/** The student's own evidence files, once an appeal was filed. */
			studentFiles: EvidenceFileView[];
	  }
	| { kind: "payment_refunded" }
	| { kind: "dispute" }
	| { kind: "certificate" }
	| { kind: "already_refunded" }
	| { kind: "window_closed"; endedAt: Date | null }
	| { kind: "over_limit"; exceeded: RefundOverLimit[]; appealDeadline: Date };
