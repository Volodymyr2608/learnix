import { api } from "@/trpc/server";

const getCoursesStats = async () => {
	try {
		return await api.course.getCoursesStats(undefined);
	} catch (error) {
		console.error("Error fetching courses stats:", error);
		return {
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
		};
	}
};

export default getCoursesStats;
