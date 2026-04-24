import { api } from "@/trpc/server";

export type GetPublishedCoursesResponse = Awaited<
	ReturnType<typeof getPublishedCourses>
>;
export type PublishedCourse = GetPublishedCoursesResponse[number];

export const getPublishedCourses = async () => {
	try {
		return await api.course.getPublishedCourses();
	} catch (error) {
		console.error(error);
		return [];
	}
};
