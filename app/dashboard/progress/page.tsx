import { PageShell } from "@/app/_components/_shared/components/PageShell";
import Achievements from "@/app/_components/Dashboard/Progress/Achievements";
import ProgressStatsCards from "@/app/_components/Dashboard/Progress/ProgressStatsCards";
import SkillProgress from "@/app/_components/Dashboard/Progress/SkillProgress";
import WeeklyActivity from "@/app/_components/Dashboard/Progress/WeeklyActivity";
import getAchievements from "@/lib/requests/student/getAchievements";
import getProgressStats from "@/lib/requests/student/getProgressStats";
import getSkillProgress from "@/lib/requests/student/getSkillProgress";

export default async function ProgressPage() {
	const [stats, achievements, skillProgress] = await Promise.all([
		getProgressStats(),
		getAchievements(),
		getSkillProgress(),
	]);

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

			<SkillProgress items={skillProgress} />
		</PageShell>
	);
}
