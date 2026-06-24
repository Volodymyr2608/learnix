import type { StudentCourseProgress } from "@/server/entities/instructor/students";

export type SendMessageMenuItemProps = {
	studentId: string;
	courses: StudentCourseProgress[];
};
