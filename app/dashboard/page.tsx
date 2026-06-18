import { redirect } from "next/navigation";
import RecommendedRail from "@/app/_components/Course/components/RecommendedRail";
import ContinueLearning from "@/app/_components/Dashboard/ContinueLearning";
import DashboardStatsCards from "@/app/_components/Dashboard/StatsCards";
import { Role } from "@/generated/prisma";
import ADMIN_URLS from "@/lib/constants/urls/adminUrls";
import INSTRUCTOR_URLS from "@/lib/constants/urls/instructorUrls";
import getContinueLearning from "@/lib/requests/student/getContinueLearning";
import getDashboardStats from "@/lib/requests/student/getDashboardStats";
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

	const [stats, continueLearning, recommendations] = await Promise.all([
		getDashboardStats(),
		getContinueLearning(),
		getRecommendations(),
	]);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="font-bold text-3xl">Dashboard</h1>
				<p className="text-muted-foreground">
					Welcome back! Here's your learning progress
				</p>
			</div>

			<DashboardStatsCards stats={stats} />
			<ContinueLearning items={continueLearning} />
			<RecommendedRail courses={recommendations} />
		</div>
	);
}
