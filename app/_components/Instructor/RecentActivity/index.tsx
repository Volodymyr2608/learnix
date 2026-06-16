import { Star, Users } from "lucide-react";
import { Card } from "@/app/_components/_shared/ui/card";
import relativeTimeLabel from "@/lib/utils/date/relativeTime";
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import type { ActivityRowProps, RecentActivityProps } from "./types";

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
	if (type === "review") return <Star className="h-4 w-4 text-primary" />;
	return <Users className="h-4 w-4 text-primary" />;
}

function activityText(event: ActivityEvent): string {
	if (event.type === "review") {
		return `${event.studentName} left a ${event.rating}-star review on ${event.courseTitle}`;
	}
	return `${event.studentName} enrolled in ${event.courseTitle}`;
}

function ActivityRow({ event }: ActivityRowProps) {
	return (
		<div className="flex items-start gap-3 rounded-lg border p-4">
			<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<ActivityIcon type={event.type} />
			</div>
			<div className="flex-1">
				<p className="font-medium text-sm">{activityText(event)}</p>
				<p className="text-muted-foreground text-xs">
					{relativeTimeLabel(event.occurredAt)}
				</p>
			</div>
		</div>
	);
}

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
