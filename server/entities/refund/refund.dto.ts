import type { RefundDecision } from "@/generated/prisma";

/** FR-S2 conditions, in the order a denial names them. */
export const REFUND_CONDITIONS = [
	"window",
	"threshold",
	"certificate",
	"earlier_refund",
	"account_limit",
	"dispute",
] as const;

export type RefundCondition = (typeof REFUND_CONDITIONS)[number];

/** What the server knows at submission, gathered under the per-student lock. */
export type RefundFacts = {
	paidAt: Date | null;
	/** L: non-deleted lessons of the course (lesson and its section not deleted). */
	lessonCount: number;
	/** Opened lessons among the same L lessons. */
	openedCount: number;
	hasCertificate: boolean;
	hasEarlierCountingRefund: boolean;
	accountLimitRefunds12m: number;
	hasOpenDispute: boolean;
};

/** FR-S5 snapshot stored on the request. Dates as ISO strings (JSON column). */
export type RefundSnapshot = Omit<RefundFacts, "paidAt"> & {
	paidAt: string | null;
	windowEndsAt: string | null;
	evaluatedAt: string;
	threshold: number;
	conditions: Record<RefundCondition, boolean>;
};

export type RefundDecisionResult = {
	decision: RefundDecision;
	failedConditions: RefundCondition[];
	snapshot: RefundSnapshot;
};
