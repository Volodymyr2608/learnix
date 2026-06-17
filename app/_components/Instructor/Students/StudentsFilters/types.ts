import type { GetStudentsInput } from "@/server/entities/instructor/students";

export type CourseOption = { id: string; title: string };

export type StudentsFiltersProps = {
	search: string;
	onSearchChange: (value: string) => void;
	status: GetStudentsInput["status"];
	onStatusChange: (value: GetStudentsInput["status"]) => void;
	courseId: string;
	onCourseChange: (value: string) => void;
	sort: GetStudentsInput["sort"];
	onSortChange: (value: GetStudentsInput["sort"]) => void;
	courses: CourseOption[];
};
