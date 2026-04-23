import { api } from "@/trpc/server";

export type GetPublishedCourseResponse = Awaited<
	ReturnType<typeof getPublishedCourse>
>;

export const getPublishedCourse = (courseId: string) => {
	try {
		return api.course.getPublishedCourse(courseId);
	} catch (error) {
		console.error(error);
		return null;
	}
};
