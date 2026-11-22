import { formatUtcDate } from "@/app/_components/Billing/utils";
import type { RefundCondition } from "@/server/entities/refund/refund.dto";
import { DENIAL_CONDITION_LABEL } from "@/server/entities/refund/refundLabels";
import type { RefundOverLimit } from "@/server/entities/refund/refundView.dto";

/** FR-S20 / C-TEXT: fixed — never Stripe's message (C23). */
export const PROCESSING_TEXT =
	"Refund processing. Your refund has been approved and is being processed. Your access stays open until it completes. If it takes longer than 3 days, we will email you.";

/** FR-S11. */
export const DISPUTE_TEXT =
	"A dispute about this payment is open with your bank; the refund is decided there";

/** FR-S9. */
export const CERTIFICATE_TEXT =
	"You received the certificate for this course, so this purchase can no longer be refunded.";

/** FR-S10 / D3. */
export const ALREADY_REFUNDED_TEXT =
	"This course was already refunded once, and a course can be refunded only once.";

export const PAYMENT_REFUNDED_TEXT = "This payment has already been refunded.";

/** FR-S4. */
export const REFUND_CONSEQUENCES = [
	"Your access to the course closes.",
	"Your progress in the course is erased.",
	"A course can be refunded only once.",
] as const;

const money = (amountCents: number, currency: string): string =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);

/** FR-S8. */
export const windowClosedText = (endedAt: Date | null): string =>
	endedAt
		? `The refund period ended on ${formatUtcDate(endedAt)}`
		: "The refund period has ended";

const lessons = (n: number) => (n === 1 ? "1 lesson" : `${n} lessons`);

const overLimitLine = (item: RefundOverLimit): string => {
	if (item.condition === "threshold")
		return `You opened ${lessons(item.openedCount)}; the limit for this course is ${item.threshold}.`;
	return `Your account has ${item.refunds} refunds in the last 12 months; the limit is ${item.limit}.`;
};

/** FR-S13: the exceeded condition with its numbers. */
export const overLimitLines = (exceeded: RefundOverLimit[]): string[] =>
	exceeded.map(overLimitLine);

export const refundAmountText = (amountCents: number, currency: string) =>
	`You will be refunded ${money(amountCents, currency)}.`;

/** FR-S19. */
export const refundedText = (amountCents: number, currency: string) =>
	`Refunded ${money(amountCents, currency)}. The money reaches your card in about 5–10 business days.`;

/** FR-S14: the conditions an automatic denial names. */
export const deniedConditions = (failed: RefundCondition[]): string[] =>
	failed.map((c) => DENIAL_CONDITION_LABEL[c]);

export const submittedText = (date: Date) =>
	`Submitted on ${formatUtcDate(date)}`;

/** FR-S17: an open appeal — no promised decision date. */
export const underReviewText = (submittedAt: Date) =>
	`Submitted on ${formatUtcDate(submittedAt)}. We will email you when it is decided.`;

/** FR-S16: how long the appeal stays possible. */
export const appealDeadlineText = (deadline: Date) =>
	`You can ask an admin to review this until ${formatUtcDate(deadline)} (UTC).`;

/** C20: every evidence file is downloaded through the authorizing route. */
export const evidenceHref = (fileId: string) =>
	`/api/refunds/evidence/${fileId}`;
