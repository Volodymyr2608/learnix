import type { OwnCourseStats } from "@/server/entities/course/stats";
import { api } from "@/trpc/server";

const getOwnCourseStats = async (
	courseId: string,
): Promise<OwnCourseStats | null> => {
	try {
		return await api.course.getOwnCourseStats(courseId);
	} catch (error) {
		console.error("Error fetching course stats:", error);
		return null;
	}
};

export default getOwnCourseStats;
