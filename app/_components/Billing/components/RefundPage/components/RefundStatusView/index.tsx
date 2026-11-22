import { REFUND_REASON_LABEL } from "@/server/entities/refund/refundLabels";
import {
	appealDeadlineText,
	deniedConditions,
	PROCESSING_TEXT,
	refundedText,
	submittedText,
	underReviewText,
} from "../../utils";
import { AdminDecision } from "../AdminDecision";
import { AppealForm } from "../AppealForm";
import { EvidenceFileList } from "../EvidenceFileList";
import type { RefundStatusViewProps } from "./types";
import { statusHeading } from "./utils";

/**
 * FR-S12, S14, S17–S20: the request's own status, the appeal while it waits, and its outcome.
 * Student and admin text render as text (AC-C22); nothing Stripe said appears here (C23).
 */
export const RefundStatusView = ({
	paymentId,
	state,
}: RefundStatusViewProps) => (
	<div className="space-y-4">
		<div className="space-y-1">
			<h2 className="font-semibold text-lg">{statusHeading(state.status)}</h2>
			{state.status !== "under_review" && (
				<p className="text-muted-foreground text-sm">
					{submittedText(state.submittedAt)}
				</p>
			)}
		</div>

		{state.status === "under_review" && (
			<p className="text-sm">{underReviewText(state.submittedAt)}</p>
		)}
		{state.status === "processing" && (
			<p className="text-sm">{PROCESSING_TEXT}</p>
		)}
		{state.status === "refunded" && (
			<p className="text-sm">
				{refundedText(state.amountCents, state.currency)}
			</p>
		)}
		{state.status === "denied" && !state.adminDecision && (
			<ul className="list-disc space-y-1 pl-6 text-sm">
				{deniedConditions(state.failedConditions).map((line) => (
					<li key={line}>{line}</li>
				))}
			</ul>
		)}
		{state.adminDecision && (
			<AdminDecision
				files={state.adminDecision.files}
				reason={state.adminDecision.reason}
			/>
		)}

		<div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
			<p>
				<span className="font-medium">Reason:</span>{" "}
				{REFUND_REASON_LABEL[state.reason]}
			</p>
			{state.text && (
				<p className="whitespace-pre-wrap break-words">{state.text}</p>
			)}
			<EvidenceFileList files={state.studentFiles} />
		</div>

		{state.appealDeadline && (
			<div className="space-y-3">
				<p className="text-muted-foreground text-sm">
					{appealDeadlineText(state.appealDeadline)}
				</p>
				<AppealForm openLabel="Appeal" paymentId={paymentId} />
			</div>
		)}
	</div>
);
