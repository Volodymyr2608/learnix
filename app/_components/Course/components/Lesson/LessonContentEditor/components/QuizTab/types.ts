import type { QuizQuestion } from "../../types";

export interface QuizTabProps {
	lessonId: string;
	questions: QuizQuestion[];
	onAdd: () => void;
	onRemove: (index: number) => void;
	onUpdate: (index: number, changes: Partial<QuizQuestion>) => void;
	onUpdateOption: (qIndex: number, optionId: string, text: string) => void;
}
