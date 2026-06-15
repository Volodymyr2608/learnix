export type ConnectStatus =
	| "not_started"
	| "action_required"
	| "pending_review"
	| "restricted"
	| "verified";

interface ConnectAccount {
	details_submitted: boolean;
	payouts_enabled: boolean;
	requirements: {
		currently_due: string[];
		past_due: string[];
		disabled_reason: string | null;
	};
}

export function deriveConnectStatus(
	account: ConnectAccount | null,
): ConnectStatus {
	// not_started: no account
	if (account === null) {
		return "not_started";
	}

	// restricted: disabled_reason is non-null/non-empty
	if (account.requirements.disabled_reason) {
		return "restricted";
	}

	// action_required: requirements or details not submitted
	if (
		account.requirements.currently_due.length > 0 ||
		account.requirements.past_due.length > 0 ||
		!account.details_submitted
	) {
		return "action_required";
	}

	// verified: payouts enabled
	if (account.payouts_enabled) {
		return "verified";
	}

	// pending_review: all else
	return "pending_review";
}
