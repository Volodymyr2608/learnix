import { Star, Users } from "lucide-react";
import relativeTimeLabel from "@/lib/utils/date/relativeTime";
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import { activityText } from "./helpers";
import type { ActivityRowProps } from "./types";

function ActivityIcon({ type }: { type: ActivityEvent["type"] }) {
	if (type === "review") return <Star className="h-4 w-4 text-primary" />;
	return <Users className="h-4 w-4 text-primary" />;
}

export default function ActivityRow({ event }: ActivityRowProps) {
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
