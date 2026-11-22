import type { RefundOverLimit } from "@/server/entities/refund/refundView.dto";

export type RefundOverLimitProps = {
	exceeded: RefundOverLimit[];
};
