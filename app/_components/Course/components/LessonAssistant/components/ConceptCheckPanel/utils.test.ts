import { describe, expect, it } from "vitest";
import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import {
	isLocked,
	isSubmitDisabled,
	selectedOptionIndex,
	shouldRenderPanel,
	visibleCheck,
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

describe("visibleCheck", () => {
	const withId = (id: string): ConceptCheckPublic => ({ ...check, id });

	it("shows the open check while one is open", () => {
		expect(visibleCheck(withId("open"), withId("held"))?.id).toBe("open");
	});

	/**
	 * The regression this exists for: `pendingCheck` returns PENDING rows only,
	 * so the answered check disappears from it the instant the answer lands. With
	 * nothing held, the panel unmounted in the same tick as the verdict and the
	 * student never saw whether they were right.
	 */
	it("keeps showing the answered check once it has left the pending query", () => {
		expect(visibleCheck(null, withId("held"))?.id).toBe("held");
	});

	it("follows the tutor to a newly issued check", () => {
		expect(visibleCheck(withId("new"), withId("old"))?.id).toBe("new");
	});

	it("shows nothing when there is nothing to show", () => {
		expect(visibleCheck(null, null)).toBeNull();
	});
});
