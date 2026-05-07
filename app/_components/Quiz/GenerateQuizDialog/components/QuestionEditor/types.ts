import type { EditableQuestion } from "../../types";

export interface QuestionEditorProps {
	question: EditableQuestion;
	index: number;
	disabled: boolean;
	onUpdateQuestion: (id: string, patch: Partial<EditableQuestion>) => void;
	onUpdateOption: (id: string, optIndex: number, value: string) => void;
}
