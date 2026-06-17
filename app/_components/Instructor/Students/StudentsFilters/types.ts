import type { StudentsQueryState } from "../types";

export type CourseOption = { id: string; title: string };

export type StudentsFiltersProps = {
	query: StudentsQueryState;
	courses: CourseOption[];
};
