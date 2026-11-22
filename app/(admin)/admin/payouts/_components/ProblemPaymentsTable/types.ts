import type { PayoutPanel } from "@/server/entities/payout/payout.dto";

export type ProblemPaymentsTableProps = {
	problems: PayoutPanel["problems"];
	now: Date;
};
