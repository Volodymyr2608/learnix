import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RevenueSummary } from "@/server/entities/payment/revenue";
import { api } from "@/trpc/server";

const EMPTY: RevenueSummary = {
	totalGrossCents: 0,
	thisMonth: { grossCents: 0, delta: { kind: "none" } },
	paidOutCents: 0,
	pendingCents: 0,
};

const getRevenueSummary = async (): Promise<RevenueSummary> => {
	return safeRequest(
		"instructor.getRevenueSummary",
		async () => {
			return await api.payment.getRevenueSummary();
		},
		EMPTY,
	);
};

export default getRevenueSummary;
