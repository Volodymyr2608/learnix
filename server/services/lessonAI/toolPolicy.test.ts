import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEUTRAL_REFUSAL_MESSAGE } from "@/server/services/_shared/aiGuard/messages";

const { mockLogSecurityEvent } = vi.hoisted(() => ({
	mockLogSecurityEvent: vi.fn(),
}));

vi.mock("@/server/services/_shared/aiGuard/securityLog", () => ({
	logSecurityEvent: mockLogSecurityEvent,
}));

const { authorizeAskConceptCheck, newTurnDenialLedger } = await import(
	"./toolPolicy"
);

const CONCEPTS = ["Recursion", "Base case"];

const wellFormed = {
	concept: "Recursion",
	question: "Which call ends a recursive descent?",
	options: [
		"The base case",
		"The first recursive call",
		"The outermost frame",
		"The largest input",
	],
	correctOption: "The base case",
};

const checkCtx = (
	overrides: Partial<ReturnType<typeof baseCheckCtx>> = {},
) => ({
	...baseCheckCtx(),
	...overrides,
});

function baseCheckCtx() {
	return {
		userId: "user-1",
		lessonConcepts: CONCEPTS,
		groundedByRetrieval: true,
		denials: undefined as ReturnType<typeof newTurnDenialLedger> | undefined,
	};
}

const ruleIdsLogged = () =>
	mockLogSecurityEvent.mock.calls.flatMap(
		(call) => (call[0] as { ruleIds: string[] }).ruleIds,
	);

describe("authorizeAskConceptCheck", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("authorizes a well-formed check on a grounded turn", () => {
		const result = authorizeAskConceptCheck(wellFormed, checkCtx());

		expect(result).toEqual({ authorized: true, canonicalConcept: "Recursion" });
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("returns the allowlist's spelling, not the model's", () => {
		const result = authorizeAskConceptCheck(
			{ ...wellFormed, concept: "  recursion " },
			checkCtx(),
		);

		expect(result).toEqual({ authorized: true, canonicalConcept: "Recursion" });
	});

	/**
	 * One case per rule. Each request violates exactly the rule named and nothing
	 * earlier, so the id asserted is the id that fired.
	 */
	const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
		[
			"concept_not_allowlisted",
			{ ...wellFormed, concept: "Course completed in full" },
			{},
		],
		["check_not_grounded", wellFormed, { groundedByRetrieval: false }],
		["question_length", { ...wellFormed, question: "Why?" }, {}],
		[
			"question_length",
			{ ...wellFormed, question: `Which call ${"x".repeat(400)}?` },
			{},
		],
		[
			"option_count",
			{
				...wellFormed,
				options: ["The base case", "A recursive call", "A stack frame"],
			},
			{},
		],
		[
			"option_count",
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"An accumulator",
					"A tail call",
					"A trampoline",
				],
			},
			{},
		],
		[
			"option_length",
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"x".repeat(200),
				],
			},
			{},
		],
		[
			"option_markup",
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"See https://example.com/answer",
				],
			},
			{},
		],
		[
			"option_markup",
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"[the answer](https://example.com)",
				],
			},
			{},
		],
		[
			"option_markup",
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"<img src=x onerror=alert(1)>",
				],
			},
			{},
		],
		[
			"options_not_distinct",
			{
				...wellFormed,
				options: ["A", "a.", "A stack frame", "An accumulator"],
				correctOption: "A",
			},
			{},
		],
		[
			"correct_option_not_offered",
			{ ...wellFormed, correctOption: "Something else entirely" },
			{},
		],
		[
			"question_reveals_answer",
			{
				...wellFormed,
				question: "Is the base case what ends a recursive descent?",
			},
			{},
		],
	];

	it.each(cases)("denies with %s", (ruleId, request, ctxOverrides) => {
		const result = authorizeAskConceptCheck(
			request as typeof wellFormed,
			checkCtx(ctxOverrides as Partial<ReturnType<typeof baseCheckCtx>>),
		);

		expect(result).toEqual({
			authorized: false,
			message: NEUTRAL_REFUSAL_MESSAGE,
		});
		expect(ruleIdsLogged()).toEqual([ruleId]);
	});

	it("logs only the first failing rule when several would deny", () => {
		// Unallowlisted concept, ungrounded turn, two options, and a key that is
		// not among them: four denials available, one id logged.
		authorizeAskConceptCheck(
			{
				concept: "Not a concept",
				question: "?",
				options: ["a", "a."],
				correctOption: "z",
			},
			checkCtx({ groundedByRetrieval: false }),
		);

		expect(ruleIdsLogged()).toEqual(["concept_not_allowlisted"]);
	});

	it("names no concept and no authored text in the event it emits", () => {
		authorizeAskConceptCheck(
			{ ...wellFormed, concept: "Secret Concept" },
			checkCtx(),
		);

		const payload = JSON.stringify(mockLogSecurityEvent.mock.calls[0]?.[0]);
		expect(payload).not.toContain("Secret Concept");
		expect(payload).not.toContain("base case");
	});
});

describe("the two classes of denial", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	const outcomes = () =>
		mockLogSecurityEvent.mock.calls.map(
			(call) => (call[0] as { outcome: string }).outcome,
		);

	it("declines an empty allowlist as routine, not as an attack", () => {
		const result = authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ lessonConcepts: [] }),
		);

		expect(outcomes()).toEqual(["tool_call_declined"]);
		expect(result.authorized).toBe(false);
		// A lesson whose insights never generated is not an adversary, and the
		// model is told enough to say something coherent to the student.
		if (!result.authorized) {
			expect(result.message).not.toBe(NEUTRAL_REFUSAL_MESSAGE);
			expect(result.message.length).toBeGreaterThan(0);
		}
	});

	it("reports an ungrounded check as an unsafe call", () => {
		const result = authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ groundedByRetrieval: false }),
		);

		expect(outcomes()).toEqual(["unsafe_tool_call"]);
		expect(result).toEqual({
			authorized: false,
			message: NEUTRAL_REFUSAL_MESSAGE,
		});
	});

	it("emits one event per class per turn, not one per attempt", () => {
		const ledger = newTurnDenialLedger();

		for (let i = 0; i < 5; i++) {
			authorizeAskConceptCheck(
				wellFormed,
				checkCtx({ lessonConcepts: [], denials: ledger }),
			);
		}

		expect(outcomes()).toEqual(["tool_call_declined"]);
	});

	it("still raises the zero-baseline alert after a routine decline in the same turn", () => {
		const ledger = newTurnDenialLedger();

		authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ lessonConcepts: [], denials: ledger }),
		);
		authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ groundedByRetrieval: false, denials: ledger }),
		);

		// Suppressing the second because the first already fired would let a
		// benign denial hide an attack behind it.
		expect(outcomes()).toEqual(["tool_call_declined", "unsafe_tool_call"]);
	});

	it("emits every denial when no turn ledger is supplied", () => {
		authorizeAskConceptCheck(wellFormed, checkCtx({ lessonConcepts: [] }));
		authorizeAskConceptCheck(wellFormed, checkCtx({ lessonConcepts: [] }));

		expect(outcomes()).toEqual(["tool_call_declined", "tool_call_declined"]);
	});
});
