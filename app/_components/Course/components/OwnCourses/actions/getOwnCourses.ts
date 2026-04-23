import { api } from "@/trpc/server";

export type GetOwnCoursesResponse = Awaited<ReturnType<typeof getOwnCourses>>;
export type OwnCourse = GetOwnCoursesResponse[number];

export const getOwnCourses = async () => {
	try {
		return await api.course.getOwnCourses();
	} catch (error) {
		console.error(error);
		return [];
	}
};
