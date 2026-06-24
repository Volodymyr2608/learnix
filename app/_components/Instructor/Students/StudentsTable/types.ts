import type { StudentRow } from "@/server/entities/instructor/students";

export type StudentsTableProps = {
	students: StudentRow[];
	isLoading: boolean;
	currentPage: number;
	lastPage: number;
	onPageChange: (page: number) => void;
	onViewDetails: (student: StudentRow) => void;
};
