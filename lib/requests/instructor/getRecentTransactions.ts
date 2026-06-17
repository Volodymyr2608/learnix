import type { RevenueTransaction } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

const getRecentTransactions = async (): Promise<RevenueTransaction[]> => {
	try {
		return await api.payment.getRecentTransactions({ limit: 10 });
	} catch (error) {
		console.error("Error fetching recent transactions:", error);
		return [];
	}
};

export default getRecentTransactions;
