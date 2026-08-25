import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

export type GetPublishedCourseResponse = Awaited<
	ReturnType<typeof getPublishedCourse>
>;

export const getPublishedCourse = (courseId: string) => {
	return safeRequest(
		"course.getPublishedCourse",
		async () => {
			return api.course.getPublishedCourse(courseId);
		},
		null,
	);
};
