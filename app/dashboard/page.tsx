import { Award, BookOpen, Clock, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import RecommendedRail from "@/app/_components/Course/components/RecommendedRail";
import { Role } from "@/generated/prisma";
import ADMIN_URLS from "@/lib/constants/urls/adminUrls";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import { getSession } from "@/server/better-auth/server";
import { getRecommendations } from "./actions/getRecommendations";

export default async function DashboardPage() {
	const session = await getSession();

	if (!session?.user) {
		redirect("/sign-in");
	}

	if (session.user.role === Role.INSTRUCTOR) {
		redirect(INSTRUCTOR_URLS.dashboard);
	}

	if (session.user.role === Role.ADMIN) {
		redirect(ADMIN_URLS.dashboard);
	}

	const recommendations = await getRecommendations();

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Dashboard</h1>
				<p className="text-muted-foreground">
					Welcome back! Here's your learning progress
				</p>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Enrolled Courses
						</CardTitle>
						<BookOpen className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">12</div>
						<p className="text-muted-foreground text-xs">+2 from last month</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Hours Learned</CardTitle>
						<Clock className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">48.5</div>
						<p className="text-muted-foreground text-xs">
							+12.5 from last week
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">Certificates</CardTitle>
						<Award className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">5</div>
						<p className="text-muted-foreground text-xs">+1 this month</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							Completion Rate
						</CardTitle>
						<TrendingUp className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">87%</div>
						<p className="text-muted-foreground text-xs">+5% from last month</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Continue Learning</CardTitle>
					<CardDescription>Pick up where you left off</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{[
							{
								title: "Advanced React Patterns",
								progress: 65,
								lesson: "Lesson 8: Custom Hooks",
							},
							{
								title: "TypeScript Fundamentals",
								progress: 42,
								lesson: "Lesson 5: Generics",
							},
							{
								title: "UI/UX Design Principles",
								progress: 88,
								lesson: "Lesson 12: Prototyping",
							},
						].map((course) => (
							<div className="space-y-2" key={course.title}>
								<div className="flex items-center justify-between">
									<div>
										<p className="font-medium">{course.title}</p>
										<p className="text-muted-foreground text-sm">
											{course.lesson}
										</p>
									</div>
									<span className="font-medium text-sm">
										{course.progress}%
									</span>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-secondary">
									<div
										className="h-full bg-primary transition-all"
										style={{ width: `${course.progress}%` }}
									/>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			<RecommendedRail courses={recommendations} />
		</div>
	);
}
