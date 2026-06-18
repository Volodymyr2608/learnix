import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import getCoursesStats from "@/lib/requests/course/getCoursesStats";
import type { StatCardProps } from "./types";

function StatCard({ label, value, subline }: StatCardProps) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="font-medium text-sm">{label}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="font-bold text-2xl">{value}</div>
				<p className="text-muted-foreground text-xs">{subline}</p>
			</CardContent>
		</Card>
	);
}

const OwnCoursesStats = async () => {
	const { draft, published, total, lastCourses, students, revenue } =
		await getCoursesStats();

	return (
		<div className="grid gap-4 md:grid-cols-4">
			<StatCard
				label="Total Courses"
				subline={`+${lastCourses} this month`}
				value={total}
			/>
			<StatCard
				label="Published"
				subline={`${draft} drafts`}
				value={published}
			/>
			<StatCard
				label="Total Students"
				subline={`+${students.newThisMonth} students this month`}
				value={students.total}
			/>
			<StatCard
				label="Total Revenue"
				subline={`+${formatUsd(revenue.thisMonthGrossCents)} this month`}
				value={formatUsd(revenue.lifetimeGrossCents)}
			/>
		</div>
	);
};

export default OwnCoursesStats;
