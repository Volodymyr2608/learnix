import type { PreviewPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel/types";

export type BasicInfoCardProps = Pick<PreviewPanelProps, "courseData"> & {
	completed: boolean;
};
