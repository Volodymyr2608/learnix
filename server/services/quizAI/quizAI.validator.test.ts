import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "./schemas/quizOutput.schema";
import { validateSemantics } from "./quizAI.validator";

const q = (over: Partial<QuizQuestion> = {}): QuizQuestion => ({
	question: "What is 2+2?",
	options: ["3", "4", "5", "6"],
	correct: "4",
	...over,
});

describe("validateSemantics", () => {
	it("returns null for a valid question set", () => {
		expect(
			validateSemantics([
				q(),
				q({ question: "Capital of France?", options: ["A", "B", "Paris", "C"], correct: "Paris" }),
			]),
		).toBeNull();
	});
	it("flags a correct answer not present in options", () => {
		expect(validateSemantics([q({ correct: "42" })])).toMatch(
			/correct answer is not one of the options/,
		);
	});
	it("flags duplicate options", () => {
		expect(validateSemantics([q({ options: ["4", "4", "5", "6"] })])).toMatch(/duplicate options/);
	});
	it("flags duplicate question text", () => {
		expect(validateSemantics([q(), q()])).toMatch(/Duplicate question text/);
	});
});