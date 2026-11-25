import { CheckCircle2, RotateCcw } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import type { StatusBadgeProps } from "./types";

export const StatusBadge = ({ status }: StatusBadgeProps) => {
	if (status === "refunded") {
		return (
			<Badge
				className="gap-1 border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
				variant="outline"
			>
				<RotateCcw className="h-3 w-3" />
				Refunded
			</Badge>
		);
	}
	return (
		<Badge
			className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
			variant="outline"
		>
			<CheckCircle2 className="h-3 w-3" />
			Paid
		</Badge>
	);
};
