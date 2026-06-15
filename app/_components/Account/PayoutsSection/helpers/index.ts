import type { ConnectStatus } from "@/lib/connectStatus";

export const STATUS_CONFIG: Record<
	ConnectStatus,
	{ label: string; className: string }
> = {
	not_started: {
		label: "Not started",
		className: "border-transparent bg-secondary text-secondary-foreground",
	},
	action_required: {
		label: "Action required",
		className:
			"border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
	},
	pending_review: {
		label: "Pending review",
		className:
			"border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
	},
	verified: {
		label: "Verified",
		className:
			"border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
	},
	restricted: {
		label: "Restricted",
		className:
			"border-transparent bg-destructive text-white dark:bg-destructive/60",
	},
};

export function getButtonLabel(status: ConnectStatus): string {
	if (status === "not_started") return "Set up payouts";
	return "Continue verification";
}