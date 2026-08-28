import { describe, expect, it } from "vitest";
import { findKeyPaths } from "./deepKeys";

describe("findKeyPaths", () => {
	it("finds a key nested under arrays and objects", () => {
		const payload = {
			lesson: { quizzes: [{ question: "q" }, { question: "q", correct: "A" }] },
		};

		expect(findKeyPaths(payload, "correct")).toEqual([
			"$.lesson.quizzes[1].correct",
		]);
	});

	it("does not confuse a value with a key", () => {
		expect(findKeyPaths({ answer: "correct" }, "correct")).toEqual([]);
	});

	it("reports a key that is present but null or undefined", () => {
		expect(findKeyPaths({ quiz: { correct: null } }, "correct")).toEqual([
			"$.quiz.correct",
		]);
	});

	it("walks past dates without descending into them", () => {
		expect(findKeyPaths({ at: new Date() }, "correct")).toEqual([]);
	});
});
