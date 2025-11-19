import { api } from "@/trpc/server";

const getCourseById = async (courseId: string) => {
	try {
		return await api.course.getOwnCourse(courseId);
	} catch (error) {
		console.error("Error fetching course:", error);
		return null;
	}
};

export default getCourseById;
