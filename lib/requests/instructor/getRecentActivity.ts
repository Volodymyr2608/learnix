import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { ActivityEvent } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Recent activity feed for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getRecentActivity = async (): Promise<ActivityEvent[]> => {
	return safeRequest("instructor.getRecentActivity", async () => {
		return await api.instructor.getRecentActivity();
	}, []);
};

export default getRecentActivity;
