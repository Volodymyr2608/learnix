/**
 * FR-P21: the refund policy `/pricing` states once the student flag is on. It is the policy the
 * Purchases tooltip links to (`/pricing#refund-policy`) and points to the Purchases page (D-2).
 */
export const REFUND_POLICY_POINTS = [
	"You can ask for a refund within 14 days of paying for a course.",
	"The refund is automatic if you opened no more than 3 lessons, and no more than half of the course's lessons.",
	"A course cannot be refunded after you receive its certificate.",
	"A course can be refunded only once — once per course.",
	"Request it from your Purchases page, in the row of the course.",
] as const;

/** The FAQ answer before the student flag is on — today's promise, unchanged (U11). */
export const LEGACY_REFUND_FAQ_ANSWER =
	"Yes, we offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund.";

const NEW_REFUND_FAQ_ANSWER =
	"Yes, within 14 days of paying, if you opened only a few lessons and have no certificate. Request it from your Purchases page — see the refund policy below.";

export const refundFaqAnswer = (studentRefundEnabled: boolean): string =>
	studentRefundEnabled ? NEW_REFUND_FAQ_ANSWER : LEGACY_REFUND_FAQ_ANSWER;
