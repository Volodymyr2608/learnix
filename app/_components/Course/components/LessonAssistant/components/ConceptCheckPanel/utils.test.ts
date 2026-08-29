import { describe, expect, it } from "vitest";
import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import {
	isLocked,
	isSubmitDisabled,
	selectedOptionIndex,
	shouldRenderPanel,
} from "./utils";

const check = {
	id: "check-1",
	lessonId: "lesson-1",
	concept: "Recursion",
	question: "Which call ends a recursive descent?",
	options: ["The base case", "A recursive call", "A frame", "An input"],
	expiresAt: new Date(),
} satisfies ConceptCheckPublic;

describe("the concept-check panel's decisions", () => {
	it("renders nothing while the query is still loading", () => {
		expect(shouldRenderPanel(true, check)).toBe(false);
	});

	it("renders nothing when no check is open", () => {
		expect(shouldRenderPanel(false, null)).toBe(false);
	});

	it("renders the panel for an open check", () => {
		expect(shouldRenderPanel(false, check)).toBe(true);
	});

	it("keeps submit disabled until an option is chosen", () => {
		expect(isSubmitDisabled(null, false)).toBe(true);
		expect(isSubmitDisabled("The base case", false)).toBe(false);
	});

	it("locks the options while the answer is in flight", () => {
		expect(isLocked(true, null)).toBe(true);
	});

	it("locks the options for good once the answer has landed", () => {
		expect(
			isLocked(false, { isCorrect: false, correctOption: "The base case" }),
		).toBe(true);
		expect(isSubmitDisabled("A frame", true)).toBe(true);
	});

	it("submits a position in the order the server sent", () => {
		expect(selectedOptionIndex(check.options, "A frame")).toBe(2);
	});

	/**
	 * -1 rather than a thrown error or a 0: an option the server did not send is
	 * not submitted at all, so a stale selection cannot become "the first option".
	 */
	it("resolves an option the check never offered to nothing", () => {
		expect(selectedOptionIndex(check.options, "Something else")).toBe(-1);
		expect(selectedOptionIndex(check.options, null)).toBe(-1);
	});
});
