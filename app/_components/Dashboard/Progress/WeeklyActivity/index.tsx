import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import type { WeeklyActivityProps } from "./types";

export default function WeeklyActivity({ days }: WeeklyActivityProps) {
	const max = Math.max(1, ...days.map((d) => d.minutes));
	return (
		<Card>
			<CardHeader>
				<CardTitle>Weekly Activity</CardTitle>
				<CardDescription>Your learning hours this week</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{days.map((day) => (
						<div className="space-y-2" key={day.date}>
							<div className="flex items-center justify-between text-sm">
								<span className="font-medium">{day.weekday}</span>
								<span className="text-muted-foreground">
									{Math.round((day.minutes / 60) * 10) / 10} hours
								</span>
							</div>
							<Progress value={(day.minutes / max) * 100} />
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
