import type { ConnectStatus } from "@/lib/connectStatus";
import { api } from "@/trpc/server";

export type ConnectData = {
	status: ConnectStatus;
	availableCents: number;
	owedCents: number;
};

const FALLBACK: ConnectData = {
	status: "not_started",
	availableCents: 0,
	owedCents: 0,
};

const getConnectStatus = async (): Promise<ConnectData> => {
	try {
		return await api.payment.getConnectStatus();
	} catch (error) {
		console.error("Error fetching connect status:", error);
		return FALLBACK;
	}
};

export default getConnectStatus;
