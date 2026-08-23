import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { OwnCourseStats } from "@/server/entities/course/stats";
import { api } from "@/trpc/server";

const getOwnCourseStats = async (
	courseId: string,
): Promise<OwnCourseStats | null> => {
	return safeRequest(
		"course.getOwnCourseStats",
		async () => {
			return await api.course.getOwnCourseStats(courseId);
		},
		null,
	);
};

export default getOwnCourseStats;
