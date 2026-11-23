import {
	ALREADY_REFUNDED_TEXT,
	CERTIFICATE_TEXT,
	DISPUTE_TEXT,
	PAYMENT_REFUNDED_TEXT,
	REFUND_FAILED_TEXT,
	windowClosedText,
} from "../../utils";
import { RefundOverLimit } from "../RefundOverLimit";
import { RefundRequestForm } from "../RefundRequestForm";
import { RefundStatusView } from "../RefundStatusView";
import { RefundUnavailable } from "../RefundUnavailable";
import type { RefundStateViewProps } from "./types";

/** U3: one view per state the server decided — exhaustive, so a new kind cannot fall through. */
export const RefundStateView = ({ paymentId, state }: RefundStateViewProps) => {
	switch (state.kind) {
		case "form":
			return (
				<RefundRequestForm
					amountCents={state.amountCents}
					currency={state.currency}
					paymentId={paymentId}
					windowEndsAt={state.windowEndsAt}
				/>
			);
		case "status":
			return <RefundStatusView paymentId={paymentId} state={state} />;
		case "over_limit":
			return (
				<RefundOverLimit
					appealDeadline={state.appealDeadline}
					exceeded={state.exceeded}
					paymentId={paymentId}
				/>
			);
		case "window_closed":
			return <RefundUnavailable message={windowClosedText(state.endedAt)} />;
		case "dispute":
			return <RefundUnavailable message={DISPUTE_TEXT} />;
		case "certificate":
			return <RefundUnavailable message={CERTIFICATE_TEXT} />;
		case "already_refunded":
			return <RefundUnavailable message={ALREADY_REFUNDED_TEXT} />;
		case "payment_refunded":
			return <RefundUnavailable message={PAYMENT_REFUNDED_TEXT} />;
		case "refund_failed":
			return <RefundUnavailable message={REFUND_FAILED_TEXT} />;
		default: {
			const unhandled: never = state;
			return unhandled;
		}
	}
};
