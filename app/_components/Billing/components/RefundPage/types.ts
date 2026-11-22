import type { RefundPageState } from "@/server/entities/refund/refundView.dto";

export type RefundPageProps = {
	paymentId: string;
	courseTitle: string;
	state: RefundPageState;
};
