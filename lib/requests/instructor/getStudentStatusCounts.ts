import type { StudentStatusCounts } from "@/server/entities/instructor/students";
import { api } from "@/trpc/server";

const EMPTY: StudentStatusCounts = {
	total: 0,
	active: 0,
	completed: 0,
	inactive: 0,
};

const getStudentStatusCounts = async (): Promise<StudentStatusCounts> => {
	try {
		return await api.instructor.getStudentStatusCounts();
	} catch (error) {
		console.error("Error fetching student status counts:", error);
		return EMPTY;
	}
};

export default getStudentStatusCounts;
