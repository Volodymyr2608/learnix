import type { CourseData } from "@/app/_components/Course/components/AIChatBuilderDialog/types";

export type PreviewPanelProps = {
	courseData: CourseData;
	completedSteps: string[];
	onApply: () => void;
};
