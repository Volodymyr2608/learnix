import type { PayoutRunView } from "@/server/entities/payout/payout.dto";

type BadgeVariant = "secondary" | "destructive" | "outline";

const OUTCOME_BADGE: Record<
	PayoutRunView["outcome"],
	{ label: string; variant: BadgeVariant }
> = {
	succeeded: { label: "Succeeded", variant: "secondary" },
	failed: { label: "Failed", variant: "destructive" },
	crashed: { label: "Crashed", variant: "destructive" },
	running: { label: "Running", variant: "outline" },
};

export const outcomeBadge = (outcome: PayoutRunView["outcome"]) =>
	OUTCOME_BADGE[outcome];

/** "2026-11-18 03:00 UTC" */
export const utcLabel = (date: Date): string =>
	`${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** FR-A8: the warning after 48 h without a successful run. */
export const staleMessage = (lastSuccessAt: Date | null): string =>
	lastSuccessAt
		? `No successful payout run for over 48 hours. Last success: ${utcLabel(lastSuccessAt)}.`
		: "No payout run has ever succeeded while instructor money is held.";
