import { AlertCircle } from "lucide-react";
import { overLimitLines } from "../../utils";
import type { RefundOverLimitProps } from "./types";

/**
 * FR-S13 (naming half, U4): the exceeded condition and its numbers. "Ask an admin to review"
 * arrives with appeals (slice 8); until then this page offers no automatic refund.
 */
export const RefundOverLimit = ({ exceeded }: RefundOverLimitProps) => (
	<div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
		<div className="flex items-center gap-2 font-medium">
			<AlertCircle className="h-4 w-4 text-amber-600" />
			This purchase cannot be refunded automatically
		</div>
		<ul className="list-disc space-y-1 pl-6">
			{overLimitLines(exceeded).map((line) => (
				<li key={line}>{line}</li>
			))}
		</ul>
	</div>
);
