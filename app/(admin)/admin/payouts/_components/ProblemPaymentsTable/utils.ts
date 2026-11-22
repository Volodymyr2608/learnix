import type { PayoutPanel } from "@/server/entities/payout/payout.dto";
import type { RetryKind } from "../RetryButton/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const ageLabel = (since: Date | null, now: Date): string => {
	if (!since) return "—";
	const ms = now.getTime() - since.getTime();
	return ms >= DAY_MS
		? `${Math.floor(ms / DAY_MS)} d`
		: `${Math.floor(ms / HOUR_MS)} h`;
};

export type ProblemRow = {
	key: string;
	kind: RetryKind;
	label: string;
	targetId: string;
	paymentId: string;
	amountCents: number;
	age: string;
	detail: string;
};

/** M8: the three problem lists as one table, each row with the Retry it needs. */
export const problemRows = (
	problems: PayoutPanel["problems"],
	now: Date,
): ProblemRow[] => [
	...problems.overdueRefunds.map((p) => ({
		key: `refund:${p.requestId}`,
		kind: "refund" as const,
		label: "Refund processing ≥ 3 days",
		targetId: p.requestId,
		paymentId: p.paymentId,
		amountCents: p.amountCents,
		age: ageLabel(p.approvedAt, now),
		detail: p.error ?? "",
	})),
	...problems.stuckTransfers.map((p) => ({
		key: `release:${p.paymentId}`,
		kind: "release" as const,
		label: "Transfer stuck",
		targetId: p.paymentId,
		paymentId: p.paymentId,
		amountCents: p.amountCents,
		age: ageLabel(p.since, now),
		detail: "",
	})),
	...problems.pendingReversals.map((p) => ({
		key: `reversal:${p.paymentId}`,
		kind: "reversal" as const,
		label: "Reversal pending",
		targetId: p.paymentId,
		paymentId: p.paymentId,
		amountCents: p.amountCents,
		age: ageLabel(p.refundedAt, now),
		detail: "",
	})),
];
