import { REFUND_WINDOW_MS } from "@/server/services/refund/refundRules";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** C5: a payment is released no earlier than 1 h after its refund window closes. */
export const RELEASE_GRACE_MS = HOUR_MS;

/** H1: a Checkout Session expires within 24 h, so paidAt ≤ createdAt + 24 h. */
export const CHECKOUT_MAX_MS = DAY_MS;

/** FR-S16: after an automatic denial the student has at least 3 days to appeal. */
export const APPEAL_GRACE_MS = 3 * DAY_MS;

/**
 * FR-P2a: the earliest moment a payment may be released. An unknown paidAt (sales before
 * slice 1, or a charge that was not expanded) is bounded by checkout creation + 24 h, which is
 * always on the safe side (H1).
 */
export const releaseEligibleAt = (
	paidAt: Date | null,
	createdAt: Date,
): Date => {
	const windowStart =
		paidAt?.getTime() ?? createdAt.getTime() + CHECKOUT_MAX_MS;
	return new Date(windowStart + REFUND_WINDOW_MS + RELEASE_GRACE_MS);
};

/** FR-S16: the later of the window end and the denial + 3 days. */
export const appealDeadline = (windowEndsAt: Date, deniedAt: Date): Date =>
	new Date(
		Math.max(windowEndsAt.getTime(), deniedAt.getTime() + APPEAL_GRACE_MS),
	);
