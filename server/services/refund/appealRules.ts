import { REFUND_WINDOW_MS } from "./refundRules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** FR-S16: after an automatic denial the student has at least 3 days to appeal. */
export const APPEAL_AFTER_DENIAL_MS = 3 * DAY_MS;

export type AppealKind = "direct" | "after_denial";
export type AppealStatus = "open" | "approved" | "denied" | "overdue_approved";

/**
 * FR-S16 / AC-F6: a direct appeal until the window ends; after an automatic denial, until the later
 * of the window end or the denial + 3 days. Null when the payment time is unknown and nothing else
 * gives a date (fail closed).
 */
export const appealDeadline = (input: {
	kind: AppealKind;
	paidAt: Date | null;
	deniedAt: Date | null;
}): Date | null => {
	const windowEnd = input.paidAt
		? input.paidAt.getTime() + REFUND_WINDOW_MS
		: null;
	if (input.kind === "direct")
		return windowEnd === null ? null : new Date(windowEnd);
	const afterDenial = input.deniedAt
		? input.deniedAt.getTime() + APPEAL_AFTER_DENIAL_MS
		: null;
	if (windowEnd === null && afterDenial === null) return null;
	return new Date(Math.max(windowEnd ?? 0, afterDenial ?? 0));
};

/** T11 (C11): never approved on time alone — the student controls these two. */
const NEVER_AUTO = new Set(["threshold", "account_limit"]);

/**
 * FR-A5 / AC-C11: an open appeal that followed an automatic denial is approved on day 14 — unless the
 * condition the server recorded is the opened-lesson threshold or the account limit. A direct appeal
 * never is.
 */
export const isAutoApprovable = (
	appeal: {
		status: AppealStatus;
		kind: AppealKind;
		exceededCondition: string;
		paidAt: Date | null;
	},
	now: Date,
): boolean =>
	appeal.status === "open" &&
	appeal.kind === "after_denial" &&
	!NEVER_AUTO.has(appeal.exceededCondition) &&
	appeal.paidAt !== null &&
	now.getTime() >= appeal.paidAt.getTime() + REFUND_WINDOW_MS;

/** FR-A4: remind the admin on payment-day 10 and 13, then daily from day 14. */
export const appealReminderDue = (paidAt: Date | null, now: Date): boolean => {
	if (!paidAt) return false;
	const day = Math.floor((now.getTime() - paidAt.getTime()) / DAY_MS);
	return day === 10 || day === 13 || day >= 14;
};
