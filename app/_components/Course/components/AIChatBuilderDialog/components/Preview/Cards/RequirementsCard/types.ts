import type { CourseSchemaOutput } from "@/server/entities/course";

export type RequirementsCardProps = {
	requirements: CourseSchemaOutput["requirements"];
	completed: boolean;
};
