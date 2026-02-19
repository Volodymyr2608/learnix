import type { CourseSchemaOutput } from "@/server/entities/course";

export type CurriculumCardProps = {
	curriculum: CourseSchemaOutput["sections"];
	completed: boolean;
};
