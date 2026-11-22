import {
	ALREADY_REFUNDED_TEXT,
	CERTIFICATE_TEXT,
	DISPUTE_TEXT,
	PAYMENT_REFUNDED_TEXT,
	windowClosedText,
} from "../../utils";
import { RefundOverLimit } from "../RefundOverLimit";
import { RefundRequestForm } from "../RefundRequestForm";
import { RefundStatusView } from "../RefundStatusView";
import { RefundUnavailable } from "../RefundUnavailable";
import type { RefundStateViewProps } from "./types";

/** U3: one view per state the server decided. */
export const RefundStateView = ({ paymentId, state }: RefundStateViewProps) => {
	if (state.kind === "form")
		return (
			<RefundRequestForm
				amountCents={state.amountCents}
				currency={state.currency}
				paymentId={paymentId}
				windowEndsAt={state.windowEndsAt}
			/>
		);
	if (state.kind === "status") return <RefundStatusView state={state} />;
	if (state.kind === "over_limit")
		return <RefundOverLimit exceeded={state.exceeded} />;
	if (state.kind === "window_closed")
		return <RefundUnavailable message={windowClosedText(state.endedAt)} />;
	if (state.kind === "dispute")
		return <RefundUnavailable message={DISPUTE_TEXT} />;
	if (state.kind === "certificate")
		return <RefundUnavailable message={CERTIFICATE_TEXT} />;
	if (state.kind === "already_refunded")
		return <RefundUnavailable message={ALREADY_REFUNDED_TEXT} />;
	return <RefundUnavailable message={PAYMENT_REFUNDED_TEXT} />;
};
