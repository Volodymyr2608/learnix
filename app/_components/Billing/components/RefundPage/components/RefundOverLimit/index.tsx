import { AlertCircle } from "lucide-react";
import { appealDeadlineText, overLimitLines } from "../../utils";
import { AppealForm } from "../AppealForm";
import type { RefundOverLimitProps } from "./types";

/**
 * FR-S13: the exceeded condition with its numbers, and "Ask an admin to review" instead of the
 * automatic refund — a direct appeal, possible until the window ends.
 */
export const RefundOverLimit = ({
	paymentId,
	exceeded,
	appealDeadline,
}: RefundOverLimitProps) => (
	<div className="space-y-4">
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
			<p className="text-muted-foreground">
				{appealDeadlineText(appealDeadline)}
			</p>
		</div>
		<AppealForm openLabel="Ask an admin to review" paymentId={paymentId} />
	</div>
);
