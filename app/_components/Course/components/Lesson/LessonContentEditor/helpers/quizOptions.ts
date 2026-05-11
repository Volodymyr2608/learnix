import type { QuizOption } from "../types";

export const makeOptionId = (questionId: string, index: number) =>
	`${questionId}-opt-${index}`;

export const makeNewOptions = (base: string): QuizOption[] =>
	Array.from({ length: 4 }, (_, i) => ({
		id: `${base}-opt-${i}`,
		text: "",
	}));
