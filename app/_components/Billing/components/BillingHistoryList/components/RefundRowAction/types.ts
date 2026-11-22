import type { PurchaseRefundRowState } from "@/server/entities/refund/refundView.dto";

export type RefundRowActionProps = {
	paymentId: string;
	refund: PurchaseRefundRowState | null;
};
