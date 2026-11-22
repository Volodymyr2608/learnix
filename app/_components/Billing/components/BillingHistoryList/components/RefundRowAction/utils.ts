import { formatUtcDate } from "@/app/_components/Billing/utils";
import type { RefundRequestStatus } from "@/server/entities/refund/refundView.dto";

/** FR-P21: the refund policy the tooltip links to. */
export const REFUND_POLICY_HREF = "/pricing#refund-policy";

const STATUS_LABEL: Record<RefundRequestStatus, string> = {
	processing: "Refund processing",
	// The row's own badge already says "Refunded" (review M6).
	refunded: "Refund details",
	denied: "Refund denied",
};

/** FR-S12: the status a row shows instead of the action — a link to its details (review I1). */
export const refundStatusLabel = (status: RefundRequestStatus): string =>
	STATUS_LABEL[status];

/** FR-S1: the window's end date, shown as visible text next to the action (review I3). */
export const refundDeadlineText = (windowEndsAt: Date): string =>
	`Refundable until ${formatUtcDate(windowEndsAt)} (UTC)`;

export const refundPageHref = (paymentId: string): string =>
	`/dashboard/billing/${paymentId}/refund`;
