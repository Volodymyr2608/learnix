import type { QuizQuestion } from "./schemas/quizOutput.schema";

export function validateSemantics(questions: QuizQuestion[]): string | null {
	const seenQuestions = new Set<string>();

	for (const [i, q] of questions.entries()) {
		const n = i + 1;

		if (!q.options.includes(q.correct)) {
			return `Question ${n}: correct answer is not one of the options`;
		}

		const uniqueOptions = new Set(q.options);
		if (uniqueOptions.size !== q.options.length) {
			return `Question ${n}: duplicate options detected`;
		}

		if (seenQuestions.has(q.question)) {
			return "Duplicate question text detected";
		}
		seenQuestions.add(q.question);
	}

	return null;
}
