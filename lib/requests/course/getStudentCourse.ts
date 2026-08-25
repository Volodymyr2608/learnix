import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { RouterOutputs } from "@/trpc/client";
import { api } from "@/trpc/server";

export type StudentCourseData = NonNullable<
	RouterOutputs["course"]["getEnrolledCourse"]
>;

const getStudentCourse = async (
	courseId: string,
): Promise<StudentCourseData | null> => {
	return safeRequest(
		"course.getStudentCourse",
		async () => {
			const course = await api.course.getEnrolledCourse(courseId);
			return course ?? null;
		},
		null,
	);
};

export default getStudentCourse;
