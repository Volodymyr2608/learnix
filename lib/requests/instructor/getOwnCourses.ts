import { api } from "@/trpc/server";

const getOwnCourses = async () => {
	try {
		return await api.course.getOwnCourses();
	} catch (error) {
		console.error("Error fetching own courses:", error);
		return [];
	}
};

export default getOwnCourses;
