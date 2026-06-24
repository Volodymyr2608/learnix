import { PageShell } from "@/app/_components/_shared/components/PageShell";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import Achievements from "@/app/_components/Dashboard/Progress/Achievements";
import ProgressStatsCards from "@/app/_components/Dashboard/Progress/ProgressStatsCards";
import WeeklyActivity from "@/app/_components/Dashboard/Progress/WeeklyActivity";
import getAchievements from "@/lib/requests/student/getAchievements";
import getProgressStats from "@/lib/requests/student/getProgressStats";

export default async function ProgressPage() {
	const [stats, achievements] = await Promise.all([
		getProgressStats(),
		getAchievements(),
	]);

	const skillProgress = [
		{ skill: "React Development", level: 85, courses: 3 },
		{ skill: "TypeScript", level: 72, courses: 2 },
		{ skill: "UI/UX Design", level: 68, courses: 2 },
		{ skill: "Python", level: 91, courses: 4 },
		{ skill: "Data Analysis", level: 55, courses: 1 },
	];

	return (
		<PageShell
			description="Track your achievements and growth"
			title="Learning Progress"
		>
			<ProgressStatsCards stats={stats} />

			<div className="grid gap-6 lg:grid-cols-2">
				<WeeklyActivity days={stats.weeklyActivity} />

				<Achievements items={achievements} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Skill Progress</CardTitle>
					<CardDescription>
						Your proficiency across different skills
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-6">
						{skillProgress.map((skill) => (
							<div className="space-y-2" key={skill.skill}>
								<div className="flex items-center justify-between">
									<div>
										<p className="font-medium">{skill.skill}</p>
										<p className="text-muted-foreground text-sm">
											{skill.courses} courses completed
										</p>
									</div>
									<span className="font-medium text-sm">{skill.level}%</span>
								</div>
								<Progress value={skill.level} />
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
