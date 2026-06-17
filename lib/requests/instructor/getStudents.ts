import type {
	GetStudentsInput,
	PaginatedStudents,
} from "@/server/entities/instructor/students";
import { api } from "@/trpc/server";

const empty = (page: number): PaginatedStudents => ({
	data: [],
	total: 0,
	currentPage: page,
	perPage: 0,
	lastPage: 1,
});

const getStudents = async (
	input: GetStudentsInput,
): Promise<PaginatedStudents> => {
	try {
		return (await api.instructor.getStudents(input)) ?? empty(input.page);
	} catch (error) {
		console.error("Error fetching instructor students:", error);
		return empty(input.page);
	}
};

export default getStudents;
