export interface EditorActionsProps {
	courseId: string;
	lessonId: string;
	isSaving: boolean;
	onSave: () => void;
}
