import { Card } from "@/app/_components/_shared/ui/card";
import ActivityRow from "./components/ActivityRow";
import type { RecentActivityProps } from "./types";

export default function RecentActivity({ events }: RecentActivityProps) {
	return (
		<Card className="p-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-lg">Recent Activity</h2>
			</div>

			{events.length === 0 && (
				<p className="py-8 text-center text-muted-foreground text-sm">
					No recent activity yet. Enrollments and reviews will show up here.
				</p>
			)}

			{events.length > 0 && (
				<div className="space-y-4">
					{events.map((event) => (
						<ActivityRow event={event} key={event.id} />
					))}
				</div>
			)}
		</Card>
	);
}
