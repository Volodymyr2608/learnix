import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type StudentCourseData = NonNullable<
	RouterOutputs["course"]["getEnrolledCourse"]
>;

const getStudentCourse = async (
	courseId: string,
): Promise<StudentCourseData | null> => {
	try {
		const course = await api.course.getEnrolledCourse(courseId);
		return course ?? null;
	} catch (error) {
		console.error("Error fetching student course:", error);
		return null;
	}
};

export default getStudentCourse;
