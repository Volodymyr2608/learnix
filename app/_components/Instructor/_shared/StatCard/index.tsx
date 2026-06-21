import { Card } from "@/app/_components/_shared/ui/card";
import type { StatCardProps } from "./types";

export default function StatCard({
	label,
	value,
	icon,
	iconWrapperClassName,
	subline,
}: StatCardProps) {
	return (
		<Card className="p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium text-muted-foreground text-sm">{label}</p>
					<p className="mt-2 font-bold text-3xl">{value}</p>
					{subline}
				</div>
				<div
					className={`flex h-12 w-12 items-center justify-center rounded-full ${iconWrapperClassName}`}
				>
					{icon}
				</div>
			</div>
		</Card>
	);
}
