import type { StudentRow } from "@/server/entities/instructor/students";

export type StudentTableRowProps = {
	student: StudentRow;
	onViewDetails: (student: StudentRow) => void;
};
