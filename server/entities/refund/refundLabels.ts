import type { RefundReason } from "@/generated/prisma";
import type { RefundCondition } from "./refund.dto";

/** FR-S14: what an automatic denial names — fixed labels, shown to the student and in emails. */
export const DENIAL_CONDITION_LABEL: Record<RefundCondition, string> = {
	window: "The 14-day refund period has ended.",
	threshold: "You opened more lessons than the refund limit for this course.",
	certificate: "You already received the course certificate.",
	earlier_refund: "This course was already refunded once.",
	account_limit: "Your account reached the limit of 3 refunds in 12 months.",
	dispute: "A dispute about this payment is open with your bank.",
};

/** FR-S3: the closed reason list, in the order the form shows it. */
export const REFUND_REASON_LABEL: Record<RefundReason, string> = {
	too_easy: "Too easy",
	too_hard: "Too hard",
	thin_content: "Thin content",
	other: "Other",
};
