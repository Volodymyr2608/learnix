import { Clock, GraduationCap, TrendingUp, Users } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import type { StatCardProps, StudentsStatsCardsProps } from "./types";

function StatCard({
	label,
	value,
	icon: Icon,
	iconWrapClass,
	iconClass,
}: StatCardProps) {
	return (
		<Card className="p-4">
			<div className="flex items-center gap-3">
				<div
					className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconWrapClass}`}
				>
					<Icon className={`h-5 w-5 ${iconClass}`} />
				</div>
				<div>
					<p className="text-muted-foreground text-sm">{label}</p>
					<p className="font-bold text-2xl">{value}</p>
				</div>
			</div>
		</Card>
	);
}

export function StudentsStatsCards({ counts }: StudentsStatsCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatCard
				icon={Users}
				iconClass="text-primary"
				iconWrapClass="bg-primary/10"
				label="Total Students"
				value={counts.total}
			/>
			<StatCard
				icon={TrendingUp}
				iconClass="text-green-600"
				iconWrapClass="bg-green-500/10"
				label="Active Learners"
				value={counts.active}
			/>
			<StatCard
				icon={GraduationCap}
				iconClass="text-blue-600"
				iconWrapClass="bg-blue-500/10"
				label="Completed"
				value={counts.completed}
			/>
			<StatCard
				icon={Clock}
				iconClass="text-gray-600"
				iconWrapClass="bg-gray-500/10"
				label="Inactive"
				value={counts.inactive}
			/>
		</div>
	);
}
