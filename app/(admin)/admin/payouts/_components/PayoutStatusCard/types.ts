import type { PayoutRunView } from "@/server/entities/payout/payout.dto";

export type PayoutStatusCardProps = {
	lastRun: PayoutRunView | null;
	lastSuccessAt: Date | null;
	stale: boolean;
};
