import { safeRequest } from "@/lib/requests/_shared/safeRequest";
import type { StudentStatusCounts } from "@/server/entities/instructor/students";
import { api } from "@/trpc/server";

const EMPTY: StudentStatusCounts = {
	total: 0,
	active: 0,
	completed: 0,
	inactive: 0,
};

const getStudentStatusCounts = async (): Promise<StudentStatusCounts> => {
	return safeRequest(
		"instructor.getStudentStatusCounts",
		async () => {
			return await api.instructor.getStudentStatusCounts();
		},
		EMPTY,
	);
};

export default getStudentStatusCounts;
