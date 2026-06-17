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

export function StudentsStatsCards({
	counts,
	isLoading,
}: StudentsStatsCardsProps) {
	const c = counts ?? { total: 0, active: 0, completed: 0, inactive: 0 };

	return (
		<div className="grid gap-4 md:grid-cols-4">
			{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
			{!isLoading && (
				<>
					<StatCard
						icon={Users}
						iconClass="text-primary"
						iconWrapClass="bg-primary/10"
						label="Total Students"
						value={c.total}
					/>
					<StatCard
						icon={TrendingUp}
						iconClass="text-green-600"
						iconWrapClass="bg-green-500/10"
						label="Active Learners"
						value={c.active}
					/>
					<StatCard
						icon={GraduationCap}
						iconClass="text-blue-600"
						iconWrapClass="bg-blue-500/10"
						label="Completed"
						value={c.completed}
					/>
					<StatCard
						icon={Clock}
						iconClass="text-gray-600"
						iconWrapClass="bg-gray-500/10"
						label="Inactive"
						value={c.inactive}
					/>
				</>
			)}
		</div>
	);
}
