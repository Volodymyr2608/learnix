import type { RefundPageState } from "@/server/entities/refund/refundView.dto";

export type RefundStateViewProps = {
	paymentId: string;
	state: RefundPageState;
};
