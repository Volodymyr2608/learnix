import type { RevenueSummary } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

const EMPTY: RevenueSummary = {
	totalGrossCents: 0,
	thisMonth: { grossCents: 0, delta: { kind: "none" } },
	paidOutCents: 0,
	pendingCents: 0,
};

const getRevenueSummary = async (): Promise<RevenueSummary> => {
	try {
		return await api.payment.getRevenueSummary();
	} catch (error) {
		console.error("Error fetching revenue summary:", error);
		return EMPTY;
	}
};

export default getRevenueSummary;
