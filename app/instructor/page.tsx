import { Eye, Star, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import DashboardStatsCards from "@/app/_components/Instructor/DashboardStatsCards";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getDashboardStats from "@/lib/requests/instructor/getDashboardStats";

export default async function DashboardPage() {
	const stats = await getDashboardStats();

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Instructor Dashboard</h1>
					<p className="text-muted-foreground">
						Welcome back! Here's your teaching overview.
					</p>
				</div>
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.createCourse}>Create New Course</Link>
				</Button>
			</div>

			{/* Stats Cards */}
			<DashboardStatsCards stats={stats} />

			{/* Course Performance */}
			<div className="grid gap-6 lg:grid-cols-2">
				<Card className="p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-semibold text-lg">Top Performing Courses</h2>
						<Button asChild size="sm" variant="ghost">
							<Link href="/instructor/courses">View All</Link>
						</Button>
					</div>
					<div className="space-y-4">
						{[
							{
								title: "Complete Web Development Bootcamp",
								students: 456,
								revenue: "$4,560",
								rating: 4.9,
							},
							{
								title: "Advanced React Patterns",
								students: 342,
								revenue: "$3,420",
								rating: 4.8,
							},
							{
								title: "Python for Data Science",
								students: 289,
								revenue: "$2,890",
								rating: 4.7,
							},
						].map((course) => (
							<div
								className="flex items-center justify-between rounded-lg border p-4"
								key={course.title}
							>
								<div className="flex-1">
									<h3 className="font-medium">{course.title}</h3>
									<div className="mt-1 flex items-center gap-4 text-muted-foreground text-sm">
										<span className="flex items-center gap-1">
											<Users className="h-4 w-4" />
											{course.students} students
										</span>
										<span className="flex items-center gap-1">
											<Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
											{course.rating}
										</span>
									</div>
								</div>
								<div className="text-right">
									<p className="font-semibold text-green-600">
										{course.revenue}
									</p>
								</div>
							</div>
						))}
					</div>
				</Card>

				<Card className="p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="font-semibold text-lg">Recent Activity</h2>
					</div>
					<div className="space-y-4">
						{[
							{
								type: "enrollment",
								text: "Sarah Johnson enrolled in Web Development",
								time: "2 hours ago",
							},
							{
								type: "review",
								text: "New 5-star review on React Patterns",
								time: "5 hours ago",
							},
							{
								type: "enrollment",
								text: "Mike Chen enrolled in Python for Data Science",
								time: "1 day ago",
							},
							{
								type: "question",
								text: "New question in Web Development Q&A",
								time: "1 day ago",
							},
							{
								type: "enrollment",
								text: "Emma Wilson enrolled in Advanced React",
								time: "2 days ago",
							},
						].map((activity) => (
							<div
								className="flex items-start gap-3 rounded-lg border p-4"
								key={activity.text}
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
									{activity.type === "enrollment" && (
										<Users className="h-4 w-4 text-primary" />
									)}
									{activity.type === "review" && (
										<Star className="h-4 w-4 text-primary" />
									)}
									{activity.type === "question" && (
										<Eye className="h-4 w-4 text-primary" />
									)}
								</div>
								<div className="flex-1">
									<p className="font-medium text-sm">{activity.text}</p>
									<p className="text-muted-foreground text-xs">
										{activity.time}
									</p>
								</div>
							</div>
						))}
					</div>
				</Card>
			</div>

			{/* Revenue Chart Placeholder */}
			<Card className="p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-lg">Revenue Overview</h2>
					<Button asChild size="sm" variant="outline">
						<Link href="/instructor/revenue">View Details</Link>
					</Button>
				</div>
				<div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
					<div className="text-center">
						<TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
						<p className="mt-2 text-muted-foreground text-sm">
							Revenue chart will be displayed here
						</p>
					</div>
				</div>
			</Card>
		</div>
	);
}
