import Link from "next/link";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import DashboardRevenueChart from "@/app/_components/Instructor/DashboardRevenueChart";
import DashboardStatsCards from "@/app/_components/Instructor/DashboardStatsCards";
import RecentActivity from "@/app/_components/Instructor/RecentActivity";
import TopPerformingCourses from "@/app/_components/Instructor/TopPerformingCourses";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getDashboardStats from "@/lib/requests/instructor/getDashboardStats";
import getRecentActivity from "@/lib/requests/instructor/getRecentActivity";
import getRevenueTimeSeries from "@/lib/requests/instructor/getRevenueTimeSeries";
import getTopPerformingCourses from "@/lib/requests/instructor/getTopPerformingCourses";

export default async function DashboardPage() {
	const [stats, revenueSeries, topCourses, activity] = await Promise.all([
		getDashboardStats(),
		getRevenueTimeSeries(),
		getTopPerformingCourses(),
		getRecentActivity(),
	]);

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
				<TopPerformingCourses courses={topCourses} />
				<RecentActivity events={activity} />
			</div>

			{/* Revenue Overview */}
			<Card className="p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-lg">Revenue Overview</h2>
					<Button asChild size="sm" variant="outline">
						<Link href="/instructor/revenue">View Details</Link>
					</Button>
				</div>
				<DashboardRevenueChart data={revenueSeries} />
			</Card>
		</div>
	);
}
