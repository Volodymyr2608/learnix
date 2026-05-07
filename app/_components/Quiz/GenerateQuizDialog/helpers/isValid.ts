import type { EditableQuestion } from "../types";

export function isValid(questions: EditableQuestion[]): boolean {
	return questions.every(
		(q) => q.question.trim() !== "" && q.options.every((o) => o.trim() !== ""),
	);
}
