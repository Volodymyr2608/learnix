import type { TopCourse } from "@/server/entities/instructor/dashboard";
import { api } from "@/trpc/server";

/** Top performing courses for the dashboard card.
 *  Degrades to an empty list on failure, mirroring getDashboardStats. */
const getTopPerformingCourses = async (): Promise<TopCourse[]> => {
	try {
		return await api.instructor.getTopPerformingCourses();
	} catch (error) {
		console.error("Error fetching instructor top performing courses:", error);
		return [];
	}
};

export default getTopPerformingCourses;