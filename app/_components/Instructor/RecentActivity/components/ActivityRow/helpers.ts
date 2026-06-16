import type { ActivityEvent } from "@/server/entities/instructor/dashboard";

export function activityText(event: ActivityEvent): string {
	if (event.type === "review") {
		return `${event.studentName} left a ${event.rating}-star review on ${event.courseTitle}`;
	}
	return `${event.studentName} enrolled in ${event.courseTitle}`;
}
