import { Award } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";
import ProgressStatsCards from "@/app/_components/Dashboard/Progress/ProgressStatsCards";
import WeeklyActivity from "@/app/_components/Dashboard/Progress/WeeklyActivity";
import getProgressStats from "@/lib/requests/student/getProgressStats";

export default async function ProgressPage() {
	const stats = await getProgressStats();

	const achievements = [
		{
			title: "Fast Learner",
			description: "Complete 5 courses in a month",
			earned: true,
		},
		{
			title: "Consistent Student",
			description: "Study 7 days in a row",
			earned: true,
		},
		{
			title: "Course Master",
			description: "Achieve 100% in any course",
			earned: true,
		},
		{
			title: "Knowledge Seeker",
			description: "Enroll in 10 courses",
			earned: false,
		},
	];

	const skillProgress = [
		{ skill: "React Development", level: 85, courses: 3 },
		{ skill: "TypeScript", level: 72, courses: 2 },
		{ skill: "UI/UX Design", level: 68, courses: 2 },
		{ skill: "Python", level: 91, courses: 4 },
		{ skill: "Data Analysis", level: 55, courses: 1 },
	];

	return (
		<div className="space-y-6">
			{/* Page Header */}
			<div>
				<h1 className="font-bold text-3xl tracking-tight">Learning Progress</h1>
				<p className="text-muted-foreground">
					Track your achievements and growth
				</p>
			</div>

			{/* Stats Overview */}
			<ProgressStatsCards stats={stats} />

			<div className="grid gap-6 lg:grid-cols-2">
				<WeeklyActivity days={stats.weeklyActivity} />

				{/* Achievements */}
				<Card>
					<CardHeader>
						<CardTitle>Achievements</CardTitle>
						<CardDescription>Your earned badges and milestones</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{achievements.map((achievement) => (
								<div className="flex items-start gap-4" key={achievement.title}>
									<div
										className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
											achievement.earned
												? "bg-primary text-primary-foreground"
												: "bg-muted text-muted-foreground"
										}`}
									>
										<Award className="h-6 w-6" />
									</div>
									<div className="flex-1">
										<p
											className={`font-medium ${!achievement.earned && "text-muted-foreground"}`}
										>
											{achievement.title}
										</p>
										<p className="text-muted-foreground text-sm">
											{achievement.description}
										</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Skill Progress */}
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
		</div>
	);
}
