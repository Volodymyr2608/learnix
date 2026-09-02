import { describe, expect, it } from "vitest";
import type { ConceptCheckPublic } from "@/server/repositories/conceptCheck.repository";
import {
	heldForTurn,
	isLocked,
	isSubmitDisabled,
	selectedOptionIndex,
	selectionFor,
	shouldRenderPanel,
	verdictFor,
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

describe("verdictFor", () => {
	const graded = {
		checkId: "check-1",
		result: { isCorrect: false, correctOption: "The base case" },
	};

	it("shows the verdict under the check it graded", () => {
		expect(verdictFor(check, graded)).toBe(graded.result);
	});

	/**
	 * The regression this exists for: the verdict was read straight off the
	 * mutation, which outlives the check it graded. A newly issued question
	 * therefore arrived on screen already locked, with the previous answer's
	 * result under it and no Submit button — the state MQ-1b needs and could
	 * never reach.
	 */
	it("shows no verdict under a check it did not grade", () => {
		expect(verdictFor({ ...check, id: "check-2" }, graded)).toBeNull();
	});

	it("shows nothing when no check is on screen", () => {
		expect(verdictFor(null, graded)).toBeNull();
	});

	it("shows nothing before an answer has been graded", () => {
		expect(verdictFor(check, null)).toBeNull();
	});
});

describe("heldForTurn", () => {
	const held = { check, turn: 3 };

	it("keeps the answered check on screen for the turn it was answered in", () => {
		expect(heldForTurn(held, 3)).toBe(check);
	});

	/**
	 * The regression this exists for: the answered check was held in state that
	 * nothing ever cleared, so the panel stayed above the thread for the rest of
	 * the session. The student read the verdict, asked the next question, and the
	 * graded panel was still there — and still there after that.
	 */
	it("drops it once the conversation has moved on", () => {
		expect(heldForTurn(held, 4)).toBeNull();
	});

	it("holds nothing when nothing has been answered", () => {
		expect(heldForTurn(null, 3)).toBeNull();
	});
});

describe("selectionFor", () => {
	const selection = { checkId: "check-1", option: "A frame" };

	it("keeps the option chosen for the check on screen", () => {
		expect(selectionFor(check, selection)).toBe("A frame");
	});

	/**
	 * An option belongs to the question that offered it. Carried across, it sat
	 * selected against a question whose options never included it —
	 * `selectedOptionIndex` then resolved it to -1 and Submit did nothing.
	 */
	it("forgets it when a different check comes on screen", () => {
		expect(selectionFor({ ...check, id: "check-2" }, selection)).toBeNull();
	});

	it("has nothing to keep before anything is chosen", () => {
		expect(selectionFor(check, null)).toBeNull();
		expect(selectionFor(null, selection)).toBeNull();
	});
});
