import { formatUtcDate } from "@/app/_components/Billing/utils";
import type { RefundRequestStatus } from "@/server/entities/refund/refundView.dto";

/** FR-P21: the refund policy the tooltip links to. */
export const REFUND_POLICY_HREF = "/pricing#refund-policy";

const STATUS_LABEL: Record<RefundRequestStatus, string> = {
	processing: "Refund processing",
	refunded: "Refunded",
	denied: "Denied",
};

/** FR-S12: the status a row shows instead of the action. */
export const refundStatusLabel = (status: RefundRequestStatus): string =>
	STATUS_LABEL[status];

/** FR-S1: the tooltip shows the window's end date. */
export const refundTooltipText = (windowEndsAt: Date): string =>
	`Refundable until ${formatUtcDate(windowEndsAt)} (UTC)`;

export const refundPageHref = (paymentId: string): string =>
	`/dashboard/billing/${paymentId}/refund`;
