"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import type { StatsRange } from "@/server/entities/stats/range";
import { STATS_RANGE_OPTIONS } from "@/server/entities/stats/range";
import type { RangeSelectProps } from "./types";

export default function RangeSelect({ value, onChange }: RangeSelectProps) {
	return (
		<Select onValueChange={(v) => onChange(v as StatsRange)} value={value}>
			<SelectTrigger className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{STATS_RANGE_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
