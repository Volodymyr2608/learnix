import type { CourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/types";

export type RequirementsCardProps = {
	requirements: CourseData["requirements"];
	completed: boolean;
};
