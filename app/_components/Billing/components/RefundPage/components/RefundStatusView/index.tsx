import { REFUND_REASON_LABEL } from "@/server/entities/refund/refundLabels";
import {
	deniedConditions,
	PROCESSING_TEXT,
	refundedText,
	submittedText,
} from "../../utils";
import type { RefundStatusViewProps } from "./types";
import { statusHeading } from "./utils";

/**
 * FR-S12, S14, S19, S20: the request's own status. The student's reason text is rendered as text
 * (AC-C22); nothing Stripe said appears here (C23).
 */
export const RefundStatusView = ({ state }: RefundStatusViewProps) => (
	<div className="space-y-4">
		<div className="space-y-1">
			<h2 className="font-semibold text-lg">{statusHeading(state.status)}</h2>
			<p className="text-muted-foreground text-sm">
				{submittedText(state.submittedAt)}
			</p>
		</div>

		{state.status === "processing" && (
			<p className="text-sm">{PROCESSING_TEXT}</p>
		)}
		{state.status === "refunded" && (
			<p className="text-sm">
				{refundedText(state.amountCents, state.currency)}
			</p>
		)}
		{state.status === "denied" && (
			<ul className="list-disc space-y-1 pl-6 text-sm">
				{deniedConditions(state.failedConditions).map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
		)}

		<div className="space-y-1 rounded-lg border bg-muted/40 p-4 text-sm">
			<p>
				<span className="font-medium">Reason:</span>{" "}
				{REFUND_REASON_LABEL[state.reason]}
			</p>
			{state.text && (
				<p className="whitespace-pre-wrap break-words">{state.text}</p>
			)}
		</div>
	</div>
);
