import type { StatsRange } from "@/server/entities/stats/range";

export type RangeSelectProps = {
	value: StatsRange;
	onChange: (range: StatsRange) => void;
};
