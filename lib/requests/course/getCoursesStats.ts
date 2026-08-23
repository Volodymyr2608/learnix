import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

const getCoursesStats = async () => {
	return safeRequest(
		"course.getCoursesStats",
		async () => {
			return await api.course.getCoursesStats(undefined);
		},
		{
			total: 0,
			draft: 0,
			published: 0,
			lastCourses: 0,
			students: { total: 0, newThisMonth: 0 },
			revenue: { lifetimeGrossCents: 0, thisMonthGrossCents: 0 },
		},
	);
};

export default getCoursesStats;
