import type { RevenueTransactionStatus } from "@/server/entities/payment/revenue";

export const STATUS_CLASS: Record<RevenueTransactionStatus, string> = {
	completed: "bg-green-500/10 text-green-600 hover:bg-green-500/10",
	pending: "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/10",
	refunded: "bg-red-500/10 text-red-600 hover:bg-red-500/10",
	failed: "bg-muted text-muted-foreground hover:bg-muted",
};
