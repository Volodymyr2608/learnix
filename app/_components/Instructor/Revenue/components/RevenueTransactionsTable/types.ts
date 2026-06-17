import type { RevenueTransaction } from "@/server/entities/payment/revenue";

export type RevenueTransactionsTableProps = {
	transactions: RevenueTransaction[];
};
