import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { TopCourse } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Top performing courses for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getTopPerformingCourses = async (): Promise<TopCourse[]> => {
	return safeRequest("instructor.getTopPerformingCourses", async () => {
		return await api.instructor.getTopPerformingCourses();
	}, []);
};

export default getTopPerformingCourses;
