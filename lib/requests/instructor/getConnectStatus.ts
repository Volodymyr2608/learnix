import type { ConnectStatus } from "@/lib/connectStatus";
import { safeRequest } from "@/lib/requests/_shared/safeRequest";
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
	return safeRequest(
		"instructor.getConnectStatus",
		async () => {
			return await api.payment.getConnectStatus();
		},
		FALLBACK,
	);
};

export default getConnectStatus;
