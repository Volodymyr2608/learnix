import type { RefundPageState } from "@/server/entities/refund/refundView.dto";

export type RefundStatusState = Extract<RefundPageState, { kind: "status" }>;

export type RefundStatusViewProps = {
	state: RefundStatusState;
};
