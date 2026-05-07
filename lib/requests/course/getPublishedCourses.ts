import { api } from "@/trpc/server";

export type GetPublishedCoursesResult = Awaited<
	ReturnType<typeof getPublishedCourses>
>;
export type PublishedCourse = GetPublishedCoursesResult["courses"][number];

export const getPublishedCourses = async (params?: {
	q?: string;
	category?: string;
	page?: number;
}) => {
	try {
		return await api.course.getPublishedCourses(params ?? {});
	} catch (error) {
		console.error(error);
		return { courses: [], total: 0 };
	}
};
