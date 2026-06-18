import type {
	GetOwnCoursesInput,
	PaginatedOwnCourses,
} from "@/server/entities/course/ownCourses";
import { api } from "@/trpc/server";

export type OwnCourse = PaginatedOwnCourses["data"][number];

const EMPTY: PaginatedOwnCourses = {
	data: [],
	total: 0,
	currentPage: 1,
	lastPage: 1,
	perPage: 9,
};

export const searchOwnCourses = async (
	input: GetOwnCoursesInput,
): Promise<PaginatedOwnCourses> => {
	try {
		return await api.course.searchOwnCourses(input);
	} catch (error) {
		console.error(error);
		return EMPTY;
	}
};
