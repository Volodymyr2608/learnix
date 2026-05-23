import type { CourseSchemaOutput } from "@/server/entities/course";

export type PreviewPanelProps = {
	courseGenerationId?: string;
	completedSteps: string[];
	onApply: (data: CourseSchemaOutput) => Promise<void>;
	isApplyPending: boolean;
	revisionCount?: number;
};
