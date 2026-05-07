export type EditableQuestion = {
	id: string;
	question: string;
	options: [string, string, string, string];
	correctIndex: number;
};

export type DialogState =
	| { phase: "generating" }
	| { phase: "review"; questions: EditableQuestion[] }
	| { phase: "saving"; questions: EditableQuestion[] };

export interface GenerateQuizDialogProps {
	lessonId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (questions: EditableQuestion[]) => void;
}
