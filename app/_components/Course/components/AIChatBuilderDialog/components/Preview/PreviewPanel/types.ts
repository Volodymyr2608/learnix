export type PreviewPanelProps = {
	courseGenerationId?: string;
	completedSteps: string[];
	onApply: (data: unknown) => void;
	isApplyPending: boolean;
};
