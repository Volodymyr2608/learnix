import { api } from "@/trpc/server";

export type GetStudentEnrolledCourses = Awaited<
	ReturnType<typeof getStudentEnrolledCourses>
>;

const getStudentEnrolledCourses = async () => {
	try {
		return await api.course.getEnrolledCourses();
	} catch (e) {
		console.error(e);
		return [];
	}
};

export default getStudentEnrolledCourses;
