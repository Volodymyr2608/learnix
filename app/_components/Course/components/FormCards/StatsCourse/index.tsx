import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { formatUsd } from "@/lib/formatUsd";
import type { StatsCourseProps } from "./types";

const StatsCourse = ({ stats }: StatsCourseProps) => {
	const rating =
		stats && stats.averageRating != null
			? `${stats.averageRating.toFixed(1)} ⭐ (${stats.reviewsCount})`
			: "No ratings yet";

	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Stats</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Students</span>
					<span className="font-semibold">{stats?.students ?? "—"}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Rating</span>
					<span className="font-semibold">{stats ? rating : "—"}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Revenue</span>
					<span className="font-semibold">
						{stats ? formatUsd(stats.revenueCents) : "—"}
					</span>
				</div>
			</CardContent>
		</Card>
	);
};

export default StatsCourse;
