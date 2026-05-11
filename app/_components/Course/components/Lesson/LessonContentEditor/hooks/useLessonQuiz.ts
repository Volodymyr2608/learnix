import { useState } from "react";
import type { EditableQuestion } from "@/app/_components/Quiz/GenerateQuizDialog/types";
import type { LessonData } from "@/lib/requests/lesson/getLessonById";
import { makeNewOptions, makeOptionId } from "../helpers/quizOptions";
import type { QuizQuestion } from "../types";

export const useLessonQuiz = (initialLesson: LessonData) => {
	const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>(() =>
		initialLesson.quizzes.map((q) => ({
			id: q.id,
			question: q.question,
			options: q.options.map((text, i) => ({
				id: makeOptionId(q.id, i),
				text,
			})),
			correctAnswer: Math.max(0, q.options.indexOf(q.correct)),
		})),
	);

	const addQuizQuestion = () => {
		const base = `new-${Date.now()}`;
		setQuizQuestions((prev) => [
			...prev,
			{ question: "", options: makeNewOptions(base), correctAnswer: 0 },
		]);
	};

	const removeQuizQuestion = (index: number) => {
		setQuizQuestions((prev) => prev.filter((_, i) => i !== index));
	};

	const updateQuiz = (index: number, changes: Partial<QuizQuestion>) => {
		setQuizQuestions((prev) =>
			prev.map((q, i) => (i === index ? { ...q, ...changes } : q)),
		);
	};

	const updateQuizOption = (qIndex: number, optionId: string, text: string) => {
		setQuizQuestions((prev) =>
			prev.map((q, i) => {
				if (i !== qIndex) return q;
				return {
					...q,
					options: q.options.map((o) =>
						o.id === optionId ? { ...o, text } : o,
					),
				};
			}),
		);
	};

	const replaceQuizFromGenerated = (generated: EditableQuestion[]) => {
		setQuizQuestions(
			generated.map((q) => ({
				question: q.question,
				options: q.options.map((text, i) => ({
					id: `${q.id}-opt-${i}`,
					text,
				})),
				correctAnswer: q.correctIndex,
			})),
		);
	};

	return {
		quizQuestions,
		addQuizQuestion,
		removeQuizQuestion,
		updateQuiz,
		updateQuizOption,
		replaceQuizFromGenerated,
	};
};
