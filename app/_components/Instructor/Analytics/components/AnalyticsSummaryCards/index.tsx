import {
	Activity,
	CheckCircle2,
	GraduationCap,
	TrendingUp,
} from "lucide-react";
import DeltaBadge from "@/app/_components/Instructor/_shared/DeltaBadge";
import StatCard from "@/app/_components/Instructor/_shared/StatCard";
import type { AnalyticsSummaryCardsProps } from "./types";

export default function AnalyticsSummaryCards({
	summary,
}: AnalyticsSummaryCardsProps) {
	const passRate =
		summary.quizPassRate.attempts === 0
			? "—"
			: `${summary.quizPassRate.value}%`;
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<StatCard
				icon={<GraduationCap className="h-6 w-6 text-blue-600" />}
				iconWrapperClassName="bg-blue-500/10"
				label="Total Enrollments"
				subline={<DeltaBadge delta={summary.enrollments.delta} />}
				value={summary.enrollments.value.toLocaleString()}
			/>
			<StatCard
				icon={<Activity className="h-6 w-6 text-green-600" />}
				iconWrapperClassName="bg-green-500/10"
				label="Active Learners"
				subline={<DeltaBadge delta={summary.activeLearners.delta} />}
				value={summary.activeLearners.value.toLocaleString()}
			/>
			<StatCard
				icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
				iconWrapperClassName="bg-purple-500/10"
				label="Avg. Progress"
				value={`${summary.avgProgress.value}%`}
			/>
			<StatCard
				icon={<CheckCircle2 className="h-6 w-6 text-yellow-600" />}
				iconWrapperClassName="bg-yellow-500/10"
				label="Quiz Pass Rate"
				subline={<DeltaBadge delta={summary.quizPassRate.delta} />}
				value={passRate}
			/>
		</div>
	);
}
