import type { ActivityEvent } from "@/server/entities/instructor/dashboard";

export type RecentActivityProps = {
	events: ActivityEvent[];
};

export type ActivityRowProps = {
	event: ActivityEvent;
};
