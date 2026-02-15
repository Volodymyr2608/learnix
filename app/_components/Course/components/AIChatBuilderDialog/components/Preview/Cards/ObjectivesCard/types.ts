import type { CourseSchemaOutput } from "@/server/entities/course";

export type ObjectiveCardProps = {
	objectives: CourseSchemaOutput["objectives"];
	completed: boolean;
};
