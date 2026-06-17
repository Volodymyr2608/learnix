import type {
	GetStudentsInput,
	StudentRow,
} from "@/server/entities/instructor/students";

export type StudentsQueryState = {
	q: string;
	status: GetStudentsInput["status"];
	courseId: string;
	sort: GetStudentsInput["sort"];
	page: number;
};

export type SelectedStudent = StudentRow | null;
