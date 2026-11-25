import type { PayoutRunCounts } from "@/server/entities/payout/payout.dto";

export const runSummaryMessage = ({
	processed,
	released,
	failed,
}: PayoutRunCounts): string => {
	if (processed === 0) return "Nothing to release right now.";
	const failures = failed > 0 ? `, ${failed} failed` : "";
	return `Released ${released} of ${processed} payout(s)${failures}.`;
};
