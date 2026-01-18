import type { PreviewPanelProps } from "@/app/_components/Course/components/AIChatBuilderDialog/components/Preview/PreviewPanel/types";

export type PreviewHeaderProps = Pick<PreviewPanelProps, "onApply"> & {
	canApply: boolean;
};
