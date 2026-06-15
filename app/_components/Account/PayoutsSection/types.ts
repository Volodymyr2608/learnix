import type { ConnectStatus } from "@/lib/connectStatus";

export type StatusBadgeProps = {
	status: ConnectStatus;
};

export type EarningsTableProps = {
	earnings: {
		availableCents: number;
		owedCents: number;
		lifetimeGrossCents: number;
		platformFeesCents: number;
	};
};
