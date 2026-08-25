import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { OwnCoursePreview } from "@/server/entities/course";
import { api } from "@/trpc/server";

const getCourseById = async (courseId: string) => {
	return safeRequest(
		"course.getCourseById",
		async () => {
			const course = await api.course.getOwnCourse(courseId);
			return course as OwnCoursePreview;
		},
		null,
	);
};

export default getCourseById;
