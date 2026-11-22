import type { RefundStatusState } from "./types";

const HEADING: Record<RefundStatusState["status"], string> = {
	processing: "Refund processing",
	refunded: "Refunded",
	denied: "Refund not approved",
};

export const statusHeading = (status: RefundStatusState["status"]): string =>
	HEADING[status];
