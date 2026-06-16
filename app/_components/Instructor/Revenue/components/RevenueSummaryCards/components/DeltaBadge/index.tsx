import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { DeltaBadgeProps } from "./types";

export default function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new") {
		return (
			<div className="mt-2 flex items-center gap-1 text-green-600 text-sm">
				<ArrowUpRight className="h-4 w-4" />
				<span>New this month</span>
			</div>
		);
	}
	if (delta.kind === "percent") {
		if (delta.direction === "flat") {
			return (
				<p className="mt-2 text-muted-foreground text-sm">
					No change from last month
				</p>
			);
		}
		const isUp = delta.direction === "up";
		const Icon = isUp ? ArrowUpRight : ArrowDownRight;
		return (
			<div
				className={`mt-2 flex items-center gap-1 text-sm ${isUp ? "text-green-600" : "text-red-600"}`}
			>
				<Icon className="h-4 w-4" />
				<span>{Math.abs(delta.value)}% from last month</span>
			</div>
		);
	}
	return null;
}
