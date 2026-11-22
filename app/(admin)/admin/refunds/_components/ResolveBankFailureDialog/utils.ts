export type BankFailureOutcome = "refunded_elsewhere" | "sale_stands";

export const OUTCOME_LABEL: Record<BankFailureOutcome, string> = {
	refunded_elsewhere: "Refunded another way",
	sale_stands: "The sale stands",
};

const DESCRIPTION: Record<BankFailureOutcome, string> = {
	refunded_elsewhere:
		"You returned the money another way. The instructor's share is cancelled; the payment stays refunded.",
	sale_stands:
		"The student keeps the course and the payment counts as paid. The instructor's share follows the normal release rule.",
};

/** FR-P27: what an outcome does, shown before the admin confirms. */
export const outcomeDescription = (outcome: BankFailureOutcome): string =>
	DESCRIPTION[outcome];
