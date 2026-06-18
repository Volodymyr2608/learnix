import { Award, Calendar, Target, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { formatDuration } from "@/lib/format/formatDuration";
import type {
	DeltaBadgeProps,
	ProgressStatsCardsProps,
	StatCardProps,
} from "./types";

function DeltaBadge({ delta, period }: DeltaBadgeProps) {
	const periodLabel = period === "week" ? "this week" : "this month";
	if (delta.kind === "none") return null;
	if (delta.kind === "new")
		return <p className="text-muted-foreground text-xs">New {periodLabel}</p>;
	if (delta.value === -100)
		return <p className="text-muted-foreground text-xs">None {periodLabel}</p>;
	if (delta.direction === "flat")
		return <p className="text-muted-foreground text-xs">No change</p>;
	const sign = delta.direction === "up" ? "+" : "−";
	return (
		<p className="text-muted-foreground text-xs">
			{sign}
			{Math.abs(delta.value)}% {periodLabel}
		</p>
	);
}

function StatCard({ label, value, icon, subline }: StatCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="font-medium text-sm">{label}</CardTitle>
				{icon}
			</CardHeader>
			<CardContent>
				<div className="font-bold text-2xl">{value}</div>
				{subline}
			</CardContent>
		</Card>
	);
}

function hours(minutes: number): string {
	return (Math.round((minutes / 60) * 10) / 10).toString();
}

export default function ProgressStatsCards({ stats }: ProgressStatsCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
				label="Total Hours"
				subline={<DeltaBadge delta={stats.totalHoursDelta} period="week" />}
				value={hours(stats.totalMinutes)}
			/>
			<StatCard
				icon={<Award className="h-4 w-4 text-muted-foreground" />}
				label="Courses Completed"
				subline={
					<DeltaBadge delta={stats.coursesCompleted.delta} period="month" />
				}
				value={stats.coursesCompleted.total.toString()}
			/>
			<StatCard
				icon={<Target className="h-4 w-4 text-muted-foreground" />}
				label="Current Streak"
				subline={<p className="text-muted-foreground text-xs">Keep it up!</p>}
				value={`${stats.currentStreakDays} days`}
			/>
			<StatCard
				icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
				label="Avg. Daily Time"
				subline={<p className="text-muted-foreground text-xs">Last 7 days</p>}
				value={formatDuration(stats.avgDailyMinutes)}
			/>
		</div>
	);
}
