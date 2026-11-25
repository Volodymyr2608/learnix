import type { RefundCondition } from "./refund.dto";

/** FR-A2: what makes "Approve" unavailable. */
export type ApproveBlocker = "certificate" | "dispute" | null;

/** FR-A1: one row of the admin appeal queue. */
export type OpenAppealView = {
	appealId: string;
	paymentId: string;
	courseTitle: string;
	studentName: string;
	kind: "direct" | "after_denial";
	exceededCondition: RefundCondition;
	reason: string;
	text: string;
	filedAt: Date;
	deadlineAt: Date;
	daysLeft: number;
	snapshot: Record<string, unknown>;
	files: { id: string; fileName: string; uploadedBy: "student" | "admin" }[];
	approveBlockedBy: ApproveBlocker;
};
