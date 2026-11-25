import { RefundReason } from "@/generated/prisma";
import { REFUND_REASON_LABEL } from "@/server/entities/refund/refundLabels";

/** FR-S3: the closed list, as radio options. */
export const REASON_OPTIONS = Object.values(RefundReason).map((value) => ({
	value,
	label: REFUND_REASON_LABEL[value],
}));

/** Matches `refundRequestInput` (2000 chars). */
export const MAX_REFUND_TEXT = 2000;
