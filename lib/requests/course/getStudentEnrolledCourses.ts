import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

export type GetStudentEnrolledCoursesResult = Awaited<
	ReturnType<typeof getStudentEnrolledCourses>
>;
export type EnrolledCourse = GetStudentEnrolledCoursesResult["courses"][number];

const getStudentEnrolledCourses = async (params?: {
	tab?: "all" | "in-progress" | "completed";
	page?: number;
}) => {
	return safeRequest(
		"course.getStudentEnrolledCourses",
		async () => {
			return await api.course.getEnrolledCourses(params ?? {});
		},
		{ courses: [], total: 0 },
	);
};

export default getStudentEnrolledCourses;
