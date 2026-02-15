import type { CourseSchemaOutput } from "@/server/entities/course";

export type BasicInfoCardProps = {
	courseData: CourseSchemaOutput;
	completed: boolean;
};
