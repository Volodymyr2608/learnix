import type { CourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/types";

export type PreviewPanelProps = {
	courseGenerationId?: string;
	courseData: CourseData;
	completedSteps: string[];
	onApply: (data: unknown) => void;
};
