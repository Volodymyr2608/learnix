import type { PurchaseRefundRowState } from "@/server/entities/refund/refundView.dto";

export type StudentPurchase = {
	paymentId: string;
	courseId: string;
	courseTitle: string;
	instructorName: string;
	amountCents: number;
	currency: string;
	status: "succeeded" | "refunded";
	purchasedAt: Date;
	refundedAt: Date | null;
	/** U7: what the row shows about a refund; null while the student flag is off. */
	refund: PurchaseRefundRowState | null;
};
