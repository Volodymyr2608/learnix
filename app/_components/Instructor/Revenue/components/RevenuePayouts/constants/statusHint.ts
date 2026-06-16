import type { ConnectStatus } from "@/lib/connectStatus";

export const STATUS_HINT: Record<ConnectStatus, string> = {
	verified: "Earnings are paid out automatically to your connected account.",
	not_started: "Set up payouts to start receiving your earnings.",
	action_required: "Finish verifying your account to receive your earnings.",
	pending_review: "Your account is under review. Payouts resume once approved.",
	restricted:
		"Your payout account needs attention before funds can be released.",
};
