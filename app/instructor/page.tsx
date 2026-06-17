import { Plus } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/app/_components/_shared/components/PageShell";
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
		<PageShell
			action={
				<Button asChild>
					<Link href={INSTRUCTOR_URLS.createCourse}>
						<Plus className="mr-2 h-4 w-4" />
						Create New Course
					</Link>
				</Button>
			}
			description="Welcome back! Here's your teaching overview."
			title="Instructor Dashboard"
		>
			<DashboardStatsCards stats={stats} />

			<div className="grid gap-6 lg:grid-cols-2">
				<TopPerformingCourses courses={topCourses} />
				<RecentActivity events={activity} />
			</div>

			<Card className="p-6">
				<div className="mb-4 flex items-center justify-between">
					<h2 className="font-semibold text-lg">Revenue Overview</h2>
					<Button asChild size="sm" variant="outline">
						<Link href="/instructor/revenue">View Details</Link>
					</Button>
				</div>
				<DashboardRevenueChart data={revenueSeries} />
			</Card>
		</PageShell>
	);
}
