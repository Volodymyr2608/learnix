import type { GetStudentsInput } from "@/server/entities/instructor/students";

export const STATUS_OPTIONS: {
	value: GetStudentsInput["status"];
	label: string;
}[] = [
	{ value: "all", label: "All Status" },
	{ value: "active", label: "Active" },
	{ value: "completed", label: "Completed" },
	{ value: "inactive", label: "Inactive" },
];
