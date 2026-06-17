import type { GetStudentsInput } from "@/server/entities/instructor/students";

export const SORT_OPTIONS: {
	value: GetStudentsInput["sort"];
	label: string;
}[] = [
	{ value: "recent", label: "Most Recent" },
	{ value: "name", label: "Name" },
	{ value: "progress", label: "Progress" },
];
