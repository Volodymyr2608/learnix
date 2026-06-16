import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Recent activity feed for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getRecentActivity = async (): Promise<ActivityEvent[]> => {
	try {
		return await api.instructor.getRecentActivity();
	} catch (error) {
		console.error("Error fetching instructor recent activity:", error);
		return [];
	}
};

export default getRecentActivity;
