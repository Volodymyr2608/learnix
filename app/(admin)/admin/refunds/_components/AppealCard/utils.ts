import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import type { ApproveBlocker } from "@/server/services/refund/refundAppealAdmin.service";

const CONDITION: Record<RefundCondition, string> = {
	window: "refund period ended",
	threshold: "over the opened-lesson limit",
	certificate: "certificate received",
	earlier_refund: "refunded once before",
	account_limit: "account refund limit reached",
	dispute: "bank dispute",
};

export const appealKindLabel = (
	kind: "direct" | "after_denial",
	condition: RefundCondition,
): string =>
	`${kind === "direct" ? "Direct appeal" : "Appeal after an automatic denial"} — ${CONDITION[condition] ?? condition}`;

export const daysLeftLabel = (days: number): string => {
	if (days <= 0) return "Deadline passed — still undecided";
	return days === 1 ? "1 day left" : `${days} days left`;
};

const num = (value: unknown): number | null =>
	typeof value === "number" ? value : null;

/** FR-A1: the snapshot numbers the admin decides on. */
export const snapshotSummary = (snapshot: Record<string, unknown>): string => {
	const opened = num(snapshot.openedCount);
	const lessons = num(snapshot.lessonCount);
	const threshold = num(snapshot.threshold);
	const refunds = num(snapshot.accountLimitRefunds12m);
	const parts: string[] = [];
	if (opened !== null && lessons !== null)
		parts.push(
			`Opened ${opened} of ${lessons} lessons${threshold !== null ? ` (limit ${threshold})` : ""}`,
		);
	if (refunds !== null)
		parts.push(
			`${refunds} automatic refund${refunds === 1 ? "" : "s"} in 12 months`,
		);
	return parts.length > 0 ? parts.join(" · ") : "No snapshot recorded";
};

/** FR-A2: why "Approve" is disabled, or null when it is not. */
export const approveBlockedText = (blocker: ApproveBlocker): string | null => {
	if (blocker === "certificate")
		return "Approve is unavailable: the student has the certificate.";
	if (blocker === "dispute")
		return "Approve is unavailable: a bank dispute is open.";
	return null;
};
