import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The `history` field of this set is what the confidence prompt hands the model
 * as a conversation, and until 2026-09-03 it did not hold one. It held the
 * author's verdict on the row: `False` rows said "vague curriculum", "no idea",
 * "incomplete course"; `True` rows said "4 solid objectives for ML",
 * "comprehensive SQL curriculum". The correlation with `expected.complete` was
 * total, so the model was reading the answer rather than judging the data, and
 * the calibration figure the gate is built on was inflated by an unknown amount.
 *
 * Found from area 4, while measuring what the node costs — not by reading the
 * set. That is the argument for pinning it here: the defect is invisible in a
 * green run BY CONSTRUCTION, since a leak makes the numbers better.
 *
 * The line this draws is not "no signal about completeness". A thin brief
 * produces thin data in production too, and the model is supposed to see that.
 * The line is authorship: a message must be something an instructor would
 * TYPE, never a description of the extracted draft written by whoever built the
 * row.
 */

type Row = {
	id: string;
	currentStep: string;
	history: { role: string; content: string; step: string }[];
	expected: { complete: boolean };
};

const rows: Row[] = readFileSync(
	resolve(process.cwd(), "evals/datasets/courseAI/confidenceScore.jsonl"),
	"utf-8",
)
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

const messages = rows.flatMap((row) =>
	row.history.map((message) => ({ id: row.id, ...message })),
);

/**
 * Words that grade a draft rather than ask for one. An instructor writing the
 * brief has not seen the extraction yet and therefore cannot use them; only
 * someone annotating a finished row can.
 */
const VERDICT_WORDS =
	/\b(vague|unclear|incomplete|partial|comprehensive|solid|well[- ]structured|thorough|minimal|sparse|generic|placeholder|TBD|detailed|rich)\b/i;

/**
 * A count of what the extraction contains ("4 solid objectives", "3 clear
 * prereqs") is the same defect wearing a number: it can only be written by
 * someone reading `draftStepData`.
 *
 * `[\s-]` and not `\s`: the leak this set actually carried included
 * "4-section Node.js curriculum", and a hyphen is the cheapest way to write the
 * same count.
 */
const COUNTS_THE_DRAFT =
	/\b\d+[\s-]+\w*[\s-]*(objectives?|sections?|lessons?|prereqs?|requirements?)\b/i;

describe("confidenceScore golden set carries a conversation, not a verdict", () => {
	it("finds rows to check", () => {
		expect(rows.length).toBeGreaterThanOrEqual(20);
	});

	it.each(
		messages.map((m) => [`${m.id}/${m.step}/${m.role}`, m.content]),
	)("%s grades nothing", (_label, content) => {
		expect(content).not.toMatch(VERDICT_WORDS);
	});

	it.each(
		messages.map((m) => [`${m.id}/${m.step}/${m.role}`, m.content]),
	)("%s counts nothing in the draft", (_label, content) => {
		expect(content).not.toMatch(COUNTS_THE_DRAFT);
	});
});

describe("the set exercises the step filter it is scored through", () => {
	/**
	 * `confidenceScore` filters history to the current step, and ADR-016 says
	 * that filter is why the score clears its threshold at all. Every row used to
	 * carry exactly one message, in-step — so the filter dropped nothing on any
	 * row, and deleting it entirely would not have moved a single number.
	 */
	it("gives several rows a message from another step, for the filter to drop", () => {
		const withNoise = rows.filter((row) =>
			row.history.some((message) => message.step !== row.currentStep),
		);

		expect(withNoise.length).toBeGreaterThanOrEqual(5);
	});

	/** Out-of-step noise on one label class only would be a leak of a new kind. */
	it("puts that noise on both complete and incomplete rows", () => {
		const noisy = rows.filter((row) =>
			row.history.some((message) => message.step !== row.currentStep),
		);

		expect(noisy.some((row) => row.expected.complete)).toBe(true);
		expect(noisy.some((row) => !row.expected.complete)).toBe(true);
	});

	/**
	 * A row with nothing left after filtering renders an empty CONVERSATION
	 * CONTEXT, which is a different prompt from the one this set exists to
	 * measure.
	 */
	it("leaves every row at least one in-step message", () => {
		const empty = rows.filter(
			(row) => !row.history.some((message) => message.step === row.currentStep),
		);

		expect(empty.map((row) => row.id)).toEqual([]);
	});
});
