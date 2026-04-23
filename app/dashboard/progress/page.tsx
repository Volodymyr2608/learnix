import { Award, Calendar, Target, TrendingUp } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Progress } from "@/app/_components/_shared/ui/progress";

export default function ProgressPage() {
	const weeklyActivity = [
		{ day: "Mon", hours: 2.5 },
		{ day: "Tue", hours: 3.2 },
		{ day: "Wed", hours: 1.8 },
		{ day: "Thu", hours: 4.1 },
		{ day: "Fri", hours: 2.9 },
		{ day: "Sat", hours: 5.5 },
		{ day: "Sun", hours: 3.7 },
	];

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
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Total Hours</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">156.5</div>
						<p className="text-muted-foreground text-xs">+23.7 this week</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Courses Completed
						</CardTitle>
						<Award className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">8</div>
						<p className="text-muted-foreground text-xs">+2 this month</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Current Streak
						</CardTitle>
						<Target className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">12 days</div>
						<p className="text-muted-foreground text-xs">Keep it up!</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Avg. Daily Time
						</CardTitle>
						<Calendar className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">3.4 hrs</div>
						<p className="text-muted-foreground text-xs">Above your goal</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Weekly Activity */}
				<Card>
					<CardHeader>
						<CardTitle>Weekly Activity</CardTitle>
						<CardDescription>Your learning hours this week</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{weeklyActivity.map((day) => (
								<div className="space-y-2" key={day.day}>
									<div className="flex items-center justify-between text-sm">
										<span className="font-medium">{day.day}</span>
										<span className="text-muted-foreground">
											{day.hours} hours
										</span>
									</div>
									<Progress value={(day.hours / 6) * 100} />
								</div>
							))}
						</div>
					</CardContent>
				</Card>

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
