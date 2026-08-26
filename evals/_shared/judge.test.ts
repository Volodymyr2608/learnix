import { describe, expect, it } from "vitest";
import { type JudgeModelCall, judgeReply } from "./judge";

/**
 * Everything here runs offline against an injected model. No test asserts a
 * score *value*: the judge is a model call, so pinning "this reply scores 4"
 * makes a test that fails on a model update for no defect. What is asserted is
 * the contract around the score — its shape, its bounds, and what happens when
 * the judge returns something that is not a score at all.
 */

const answering = (value: unknown): JudgeModelCall => {
	return async () => value;
};

const wellFormed = {
	relevance: 5,
	faithfulness: 4,
	completeness: 4,
	groundedness: 5,
	rationale:
		"Grounded in the retrieved chunk; slightly terse on the second part.",
};

const judge = (call: JudgeModelCall) =>
	judgeReply({
		question: "What is the difference between useState and useEffect?",
		retrievedContent: "useState returns a pair. useEffect runs side effects.",
		reply: "useState holds state; useEffect runs side effects after render.",
		call,
	});

describe("judgeReply", () => {
	it("returns the four axes when the judge answers in the required shape", async () => {
		const result = await judge(answering(wellFormed));

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(Object.keys(result.scores).sort()).toEqual([
			"completeness",
			"faithfulness",
			"groundedness",
			"rationale",
			"relevance",
		]);
	});

	/**
	 * A judge that returns a score outside the rubric has not scored the reply,
	 * and counting it as one would let a broken judge report a healthy surface.
	 */
	it("fails on an axis above the rubric's range", async () => {
		const result = await judge(answering({ ...wellFormed, relevance: 7 }));

		expect(result.ok).toBe(false);
	});

	it("fails on a non-integer axis", async () => {
		const result = await judge(answering({ ...wellFormed, faithfulness: 2.5 }));

		expect(result.ok).toBe(false);
	});

	it("fails when an axis is missing entirely", async () => {
		const { groundedness, ...missingAxis } = wellFormed;
		const result = await judge(answering(missingAxis));

		expect(result.ok).toBe(false);
	});

	it("fails, naming the cause, when the model call throws", async () => {
		const result = await judge(async () => {
			throw new Error("upstream exploded");
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toContain("upstream exploded");
	});

	/** The judge model is the caller's choice, not a literal inside the module. */
	it("passes the caller's model id to the call", async () => {
		let seen: string | undefined;
		const call: JudgeModelCall = async (_system, _user, model) => {
			seen = model;
			return wellFormed;
		};

		await judgeReply({
			question: "q",
			retrievedContent: "c",
			reply: "r",
			model: "gpt-4o",
			call,
		});

		expect(seen).toBe("gpt-4o");
	});
});
