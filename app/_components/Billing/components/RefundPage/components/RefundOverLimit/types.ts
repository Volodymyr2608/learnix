import type { RefundOverLimit } from "@/server/entities/refund/refundView.dto";

export type RefundOverLimitProps = {
	paymentId: string;
	exceeded: RefundOverLimit[];
	appealDeadline: Date;
};
