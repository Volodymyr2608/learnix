import type { OwnCoursePreview } from "@/server/entities/course";
import { api } from "@/trpc/server";

const getCourseById = async (courseId: string) => {
	try {
		const course = await api.course.getOwnCourse(courseId);
		return course as OwnCoursePreview;
	} catch (error) {
		console.error("Error fetching course:", error);
		return null;
	}
};

export default getCourseById;
