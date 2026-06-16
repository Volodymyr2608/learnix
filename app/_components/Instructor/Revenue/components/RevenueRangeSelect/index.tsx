"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";
import type { RevenueRange } from "@/server/entities/payment/revenue";
import { RANGE_OPTIONS } from "../../constants/rangeOptions";
import type { RevenueRangeSelectProps } from "./types";

export default function RevenueRangeSelect({
	value,
	onChange,
}: RevenueRangeSelectProps) {
	return (
		<Select onValueChange={(v) => onChange(v as RevenueRange)} value={value}>
			<SelectTrigger className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{RANGE_OPTIONS.map((o) => (
					<SelectItem key={o.value} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
