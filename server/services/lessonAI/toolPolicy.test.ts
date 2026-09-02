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

const outcomes = () =>
	mockLogSecurityEvent.mock.calls.map(
		(call) => (call[0] as { outcome: string }).outcome,
	);

describe("authorizeAskConceptCheck", () => {
	beforeEach(() => mockLogSecurityEvent.mockClear());

	it("authorizes a well-formed check on a grounded turn", () => {
		const result = authorizeAskConceptCheck(wellFormed, checkCtx());

		expect(result).toEqual({
			authorized: true,
			canonicalConcept: "Recursion",
			canonicalCorrectOption: "The base case",
		});
		expect(mockLogSecurityEvent).not.toHaveBeenCalled();
	});

	it("returns the allowlist's spelling, not the model's", () => {
		const result = authorizeAskConceptCheck(
			{ ...wellFormed, concept: "  recursion " },
			checkCtx(),
		);

		expect(result).toEqual({
			authorized: true,
			canonicalConcept: "Recursion",
			canonicalCorrectOption: "The base case",
		});
	});

	/**
	 * The near-miss this rule exists for. `correctOption` is matched against the
	 * options AFTER folding, so a trailing period or a capital letter passes —
	 * which is the tolerance the fold was written to provide. Grading, though, is
	 * byte equality against a stored option. Handing the caller the model's
	 * spelling would store an answer that is not any of the offered options, and
	 * the check becomes unanswerable-correct: the student picks the right one, is
	 * told they are wrong, spends an attempt and earns a cooldown.
	 */
	it("returns the option's own spelling, not the model's rendering of it", () => {
		const result = authorizeAskConceptCheck(
			{ ...wellFormed, correctOption: "  The Base Case. " },
			checkCtx(),
		);

		expect(result).toEqual({
			authorized: true,
			canonicalConcept: "Recursion",
			canonicalCorrectOption: "The base case",
		});
		expect(
			result.authorized &&
				wellFormed.options.includes(result.canonicalCorrectOption),
		).toBe(true);
	});

	/**
	 * One case per rule. Each request violates exactly the rule named and nothing
	 * earlier, so the id asserted is the id that fired.
	 */
	const cases: [string, Record<string, unknown>, Record<string, unknown>][] = [
		["empty_allowlist", wellFormed, { lessonConcepts: [] }],
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

	/**
	 * The rules a competent, cooperative model still trips: a stem three words
	 * long, two options that fold to the same string, a key rendered slightly
	 * differently from the option it names. They are authoring mistakes, not
	 * attacks, so they are refused as routine — see "the two classes of denial".
	 *
	 * Two members are not authoring mistakes and belong here anyway. A lesson
	 * whose insights never generated (`empty_allowlist`) has nothing wrong with
	 * its request at all. And since item 16, neither has a turn that did not
	 * retrieve: nothing about the authored text is malformed, the model simply
	 * relied on context it already had. Not mistakes, but equally not attacks —
	 * which is the line this set is drawn on.
	 */
	const ROUTINE_RULE_IDS = new Set([
		"empty_allowlist",
		"check_not_grounded",
		"question_length",
		"option_count",
		"option_length",
		"options_not_distinct",
		"correct_option_not_offered",
		"question_reveals_answer",
	]);

	/**
	 * Item 16. Which class each rule refuses through, written out rather than
	 * derived from `ROUTINE_RULE_IDS` — deriving it would make this test agree
	 * with the set it is supposed to check.
	 *
	 * It exists for the edit that has not happened yet. Moving one more rule off
	 * `unsafe_tool_call` is how that outcome's zero baseline is lost for good,
	 * and the loss is invisible per-commit: nothing else in the suite reads the
	 * emitted outcome for more than one rule at a time.
	 */
	const RULE_OUTCOMES: Record<string, string> = {
		// Evidence of an attack: a caller with no right to ask, or authored text
		// that turns an option into something to click or render.
		concept_not_allowlisted: "unsafe_tool_call",
		option_markup: "unsafe_tool_call",
		// Everything a cooperative model produces on a task nothing has measured
		// it on — plus, since item 16, a turn that did not retrieve.
		empty_allowlist: "tool_call_declined",
		check_not_grounded: "tool_call_declined",
		question_length: "tool_call_declined",
		option_count: "tool_call_declined",
		option_length: "tool_call_declined",
		options_not_distinct: "tool_call_declined",
		correct_option_not_offered: "tool_call_declined",
		question_reveals_answer: "tool_call_declined",
	};

	it.each(
		cases,
	)("emits the %s class its rule was assigned", (ruleId, request, ctxOverrides) => {
		authorizeAskConceptCheck(
			request as typeof wellFormed,
			checkCtx(ctxOverrides as Partial<ReturnType<typeof baseCheckCtx>>),
		);

		expect(outcomes()).toEqual([RULE_OUTCOMES[ruleId]]);
	});

	/**
	 * A rule added to the policy with no class assigned here fails loudly rather
	 * than silently inheriting one. `cases` is the inventory of triggers, so this
	 * inherits its one limitation: a rule with no case is invisible to both.
	 */
	it("assigns a class to every rule the cases exercise", () => {
		const exercised = new Set(cases.map(([ruleId]) => ruleId));

		expect(new Set(Object.keys(RULE_OUTCOMES))).toEqual(exercised);
	});

	it.each(cases)("denies with %s", (ruleId, request, ctxOverrides) => {
		const result = authorizeAskConceptCheck(
			request as typeof wellFormed,
			checkCtx(ctxOverrides as Partial<ReturnType<typeof baseCheckCtx>>),
		);

		expect(result.authorized).toBe(false);
		expect(ruleIdsLogged()).toEqual([ruleId]);
		if (!result.authorized && !ROUTINE_RULE_IDS.has(ruleId)) {
			expect(result.message).toBe(NEUTRAL_REFUSAL_MESSAGE);
		}
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
		// The outcome, not just the id. Since item 16 the two rules refuse through
		// different helpers, so reordering them would change what a caller with no
		// right to ask is REPORTED as — from an attack to routine — and the id
		// assertion alone would not have noticed.
		expect(outcomes()).toEqual(["unsafe_tool_call"]);
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

	/**
	 * `unsafe_tool_call` is the taxonomy's one zero-baseline outcome: its normal
	 * rate is zero, which is why securityLog forwards it to Sentry and why any
	 * occurrence is the signal. A model that writes three options instead of four
	 * is not an occurrence of anything — it is gpt-4o-mini being sloppy at a task
	 * nothing has measured it on. Filing those under the alert makes the alert
	 * mean "the tutor is running".
	 *
	 * validateReply already reasons its way to exactly this conclusion for the
	 * reply that names its own answer, and classifies it as routine. The question
	 * that contains its own answer is the same phenomenon, same model, same turn.
	 */
	const malformed: [string, Record<string, unknown>][] = [
		["question_length", { ...wellFormed, question: "Why?" }],
		[
			"option_count",
			{ ...wellFormed, options: ["The base case", "A call", "A frame"] },
		],
		[
			"option_length",
			{
				...wellFormed,
				options: ["The base case", "A call", "A frame", "x".repeat(200)],
			},
		],
		[
			"options_not_distinct",
			{
				...wellFormed,
				options: ["A", "a.", "A stack frame", "An accumulator"],
				correctOption: "A",
			},
		],
		[
			"correct_option_not_offered",
			{ ...wellFormed, correctOption: "Something else entirely" },
		],
		[
			"question_reveals_answer",
			{
				...wellFormed,
				question: "Is the base case what ends a recursive descent?",
			},
		],
	];

	it.each(
		malformed,
	)("reports %s as a routine decline, not as a zero-baseline alert", (_ruleId, request) => {
		authorizeAskConceptCheck(request as typeof wellFormed, checkCtx());

		expect(outcomes()).toEqual(["tool_call_declined"]);
	});

	it("says the same thing for every malformed check, so the rules cannot be probed", () => {
		const messages = malformed.map((entry) => {
			const result = authorizeAskConceptCheck(
				entry[1] as typeof wellFormed,
				checkCtx(),
			);
			return result.authorized ? "" : result.message;
		});

		expect(new Set(messages).size).toBe(1);
		expect(messages[0]).not.toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(messages[0]?.length).toBeGreaterThan(0);
	});

	it("still reports an option carrying a link or a tag as an unsafe call", () => {
		// Not an authoring mistake: an option is rendered to the student, so a
		// link is an exfiltration channel and a tag is an injection into the page.
		authorizeAskConceptCheck(
			{
				...wellFormed,
				options: [
					"The base case",
					"A recursive call",
					"A stack frame",
					"[the answer](https://example.com)",
				],
			},
			checkCtx(),
		);

		expect(outcomes()).toEqual(["unsafe_tool_call"]);
	});

	/**
	 * Item 16. A model that has already retrieved earlier in the conversation
	 * stops retrieving, so this rule fires on cooperative use — measured in
	 * production, `manual-qa.md` MQ-2. Routing that into `unsafe_tool_call`, the
	 * taxonomy's one zero-baseline outcome, gives the alert a baseline made of
	 * ordinary traffic and retires it.
	 */
	it("reports an ungrounded check as a routine decline, not an unsafe call", () => {
		const result = authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ groundedByRetrieval: false }),
		);

		expect(outcomes()).toEqual(["tool_call_declined"]);
		expect(result.authorized).toBe(false);
	});

	/**
	 * The message has to be actionable, because the whole point of the class
	 * change is that the agent can recover inside the turn. It names the call it
	 * wants — which discloses nothing: `ask_concept_check`'s own description
	 * already ends "Requires having called retrieve_lesson_context on this turn."
	 *
	 * And it must stay distinct from the shared malformed-check text. That text
	 * is deliberately identical across every well-formedness rule so a model
	 * cannot binary-search the validator; collapsing this one into it would hide
	 * the one refusal the model is supposed to act on.
	 */
	it("tells the model which call is missing, in words of its own", () => {
		const ungrounded = authorizeAskConceptCheck(
			wellFormed,
			checkCtx({ groundedByRetrieval: false }),
		);
		const malformedResult = authorizeAskConceptCheck(
			{ ...wellFormed, question: "Why?" },
			checkCtx(),
		);

		if (ungrounded.authorized || malformedResult.authorized)
			throw new Error("both calls must be refused");

		expect(ungrounded.message).toContain("retrieve_lesson_context");
		expect(ungrounded.message).not.toBe(NEUTRAL_REFUSAL_MESSAGE);
		expect(ungrounded.message).not.toBe(malformedResult.message);
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
			{ ...wellFormed, concept: "Course completed in full" },
			checkCtx({ denials: ledger }),
		);

		// Suppressing the second because the first already fired would let a
		// benign denial hide an attack behind it. The attack here is a concept
		// outside the allowlist; it used to be an ungrounded turn, which item 16
		// reclassified as routine — the property is unchanged, its example moved.
		expect(outcomes()).toEqual(["tool_call_declined", "unsafe_tool_call"]);
	});

	it("emits every denial when no turn ledger is supplied", () => {
		authorizeAskConceptCheck(wellFormed, checkCtx({ lessonConcepts: [] }));
		authorizeAskConceptCheck(wellFormed, checkCtx({ lessonConcepts: [] }));

		expect(outcomes()).toEqual(["tool_call_declined", "tool_call_declined"]);
	});
});
