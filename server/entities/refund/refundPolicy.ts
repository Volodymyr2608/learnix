/**
 * FR-P21: the refund policy, on its own page (`/refund-policy`) once the student flag is on. The
 * Purchases row and the `/pricing` FAQ link to it; it points to the Purchases page (D-2).
 */
export const REFUND_POLICY_PATH = "/refund-policy";

/** FR-S4: what a refund takes away — the refund page and the policy say the same. */
export const REFUND_CONSEQUENCES = [
	"Your access to the course closes.",
	"Your progress in the course is erased.",
	"A course can be refunded only once.",
] as const;

export type RefundPolicySectionId = "when" | "how" | "appeal" | "after";

export type RefundPolicySectionContent = {
	id: RefundPolicySectionId;
	title: string;
	points: readonly string[];
};

export const REFUND_POLICY_SECTIONS: readonly RefundPolicySectionContent[] = [
	{
		id: "when",
		title: "When you can get a refund",
		points: [
			"You can ask for a refund within 14 days of paying for a course.",
			"The refund is automatic if you opened no more than 3 lessons, and no more than half of the course's lessons.",
			"A course cannot be refunded after you receive its certificate.",
			"A course can be refunded only once — once per course.",
		],
	},
	{
		id: "how",
		title: "How to ask",
		points: [
			"Request it from your Purchases page, in the row of the course.",
			"Choose a reason. You get the answer at once.",
			"An approved refund goes back to the card you paid with.",
		],
	},
	{
		id: "appeal",
		title: "If the answer is no",
		points: [
			"You can appeal once, with an explanation and up to 3 files (PNG, JPEG or PDF).",
			"You have at least 3 days after the answer to appeal.",
			"An admin reviews the appeal, and we email you the decision.",
		],
	},
	{
		id: "after",
		title: "What happens after a refund",
		points: REFUND_CONSEQUENCES,
	},
];

/** The FAQ answer before the student flag is on — today's promise, unchanged (U11). */
export const LEGACY_REFUND_FAQ_ANSWER =
	"Yes, we offer a 30-day money-back guarantee. If you're not satisfied, contact us for a full refund.";

const NEW_REFUND_FAQ_ANSWER =
	"Yes, within 14 days of paying, if you opened only a few lessons and have no certificate. Request it from your Purchases page.";

export const refundFaqAnswer = (studentRefundEnabled: boolean): string =>
	studentRefundEnabled ? NEW_REFUND_FAQ_ANSWER : LEGACY_REFUND_FAQ_ANSWER;
