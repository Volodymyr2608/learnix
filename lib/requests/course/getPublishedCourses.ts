import { safeRequest } from "@/lib/requests/_shared/safeRequest";
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
	return safeRequest(
		"course.getPublishedCourses",
		async () => {
			return await api.course.getPublishedCourses(params ?? {});
		},
		{ courses: [], total: 0 },
	);
};
