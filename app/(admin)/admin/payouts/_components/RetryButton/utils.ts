type RetryResult = { status: string } | { outcome: string };

const FIXED = new Set([
	"refunded",
	"released",
	"already_transferred",
	"reversed_after_refund",
	"reversed",
]);

const WARNINGS: Record<string, string> = {
	processing: "Still processing at Stripe — see the error.",
	failed: "The transfer failed again — see the run history.",
	waiting_for_stripe: "The instructor cannot be paid yet (Stripe payouts off).",
	charge_not_payable: "The charge is refunded or disputed in Stripe.",
	not_eligible: "Nothing to do: the payment is not eligible now.",
};

/** Review I2: a Retry that changed nothing must not read as success. */
export const retryResultMessage = (
	result: RetryResult,
): { tone: "success" | "warning"; text: string } => {
	const value = "status" in result ? result.status : result.outcome;
	if (FIXED.has(value)) return { tone: "success", text: "Fixed." };
	return { tone: "warning", text: WARNINGS[value] ?? `Result: ${value}` };
};
