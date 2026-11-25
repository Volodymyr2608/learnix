import type { RefundStatusState } from "./types";

const HEADING: Record<RefundStatusState["status"], string> = {
	processing: "Refund processing",
	refunded: "Refunded",
	denied: "Refund not approved",
	under_review: "Under review",
	refund_failed: "Refund failed",
};

export const statusHeading = (status: RefundStatusState["status"]): string =>
	HEADING[status];
