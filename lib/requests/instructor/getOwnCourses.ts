import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import { api } from "@/trpc/server";

const getOwnCourses = async () => {
	return safeRequest("instructor.getOwnCourses", async () => {
		return await api.course.getOwnCourses();
	}, []);
};

export default getOwnCourses;
