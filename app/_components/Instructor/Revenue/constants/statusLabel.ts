import type { RevenueTransactionStatus } from "@/server/entities/payment/revenue";

export const STATUS_LABEL: Record<RevenueTransactionStatus, string> = {
	completed: "Completed",
	pending: "Pending",
	refunded: "Refunded",
	failed: "Failed",
};
