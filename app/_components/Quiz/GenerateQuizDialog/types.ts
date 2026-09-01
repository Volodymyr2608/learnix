export type EditableQuestion = {
	id: string;
	question: string;
	options: [string, string, string, string];
	correctIndex: number;
	/**
	 * The concept the generator tagged this question with. Carried through the
	 * dialog untouched and never edited here — the server resolves it again on
	 * save, so the form has no reason to offer it.
	 */
	concept?: string | null;
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
