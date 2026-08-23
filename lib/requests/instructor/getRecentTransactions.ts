import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RevenueTransaction } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

const getRecentTransactions = async (): Promise<RevenueTransaction[]> => {
	return safeRequest("instructor.getRecentTransactions", async () => {
		return await api.payment.getRecentTransactions({ limit: 10 });
	}, []);
};

export default getRecentTransactions;
