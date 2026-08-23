import { safeRequest } from "@/lib/requests/_shared/safeRequest";
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
	return safeRequest(
		"instructor.getStudents",
		async () => {
			return (await api.instructor.getStudents(input)) ?? empty(input.page);
		},
		empty(input.page),
	);
};

export default getStudents;
