import { Award, BookOpen, Clock, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type {
	DashboardStatsCardsProps,
	DeltaBadgeProps,
	StatCardProps,
} from "./types";

function DeltaBadge({ delta }: DeltaBadgeProps) {
	if (delta.kind === "none") return null;
	if (delta.kind === "new")
		return <p className="text-muted-foreground text-xs">New this month</p>;
	if (delta.value === -100)
		return <p className="text-muted-foreground text-xs">None this month</p>;
	if (delta.direction === "flat")
		return <p className="text-muted-foreground text-xs">No change</p>;
	const sign = delta.direction === "up" ? "+" : "−";
	return (
		<p className="text-muted-foreground text-xs">
			{sign}
			{Math.abs(delta.value)}% from last month
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

export default function DashboardStatsCards({
	stats,
}: DashboardStatsCardsProps) {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
				label="Enrolled Courses"
				subline={<DeltaBadge delta={stats.enrolledCourses.delta} />}
				value={stats.enrolledCourses.total.toString()}
			/>
			<StatCard
				icon={<Clock className="h-4 w-4 text-muted-foreground" />}
				label="Hours Learned"
				subline={<DeltaBadge delta={stats.hoursLearned.delta} />}
				value={hours(stats.hoursLearned.totalMinutes)}
			/>
			<StatCard
				icon={<Award className="h-4 w-4 text-muted-foreground" />}
				label="Certificates"
				subline={<DeltaBadge delta={stats.certificates.delta} />}
				value={stats.certificates.total.toString()}
			/>
			<StatCard
				icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
				label="Completion Rate"
				subline={
					<p className="text-muted-foreground text-xs">
						Across enrolled courses
					</p>
				}
				value={`${stats.completionRate.percent}%`}
			/>
		</div>
	);
}
