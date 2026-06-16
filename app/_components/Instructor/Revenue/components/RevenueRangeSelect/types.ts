import type { RevenueRange } from "@/server/entities/payment/revenue";

export type RevenueRangeSelectProps = {
	value: RevenueRange;
	onChange: (range: RevenueRange) => void;
};
