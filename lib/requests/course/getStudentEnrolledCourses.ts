import { api } from "@/trpc/server";

export type GetStudentEnrolledCoursesResult = Awaited<
	ReturnType<typeof getStudentEnrolledCourses>
>;
export type EnrolledCourse = GetStudentEnrolledCoursesResult["courses"][number];

const getStudentEnrolledCourses = async (params?: {
	tab?: "all" | "in-progress" | "completed";
	page?: number;
}) => {
	try {
		return await api.course.getEnrolledCourses(params ?? {});
	} catch (e) {
		console.error(e);
		return { courses: [], total: 0 };
	}
};

export default getStudentEnrolledCourses;
