import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This set was authored against the wrong question and driven through the wrong
 * field, and both defects were invisible in a green run.
 *
 * The field: `assessCompletion.eval.ts` passed `userMessage: ""`, which is the
 * first thing the node's guard tests
 * (`server/services/courseAI/graph/nodes/assessCompletion.ts:28-33`). Every row
 * returned on line one, no row reached the model, every prediction came back
 * `false`, and the old empty-set branch of `precisionGate` called the absence
 * 100%. The gate is fixed; this file is what stops the *set* from being written
 * that way again.
 *
 * The question: the node decides whether the latest user turn signals **proceed**
 * — its own enum is `ready | not_ready | ask`. The set graded whether the step's
 * *content was complete*, which is `confidenceScore`'s question. Row 01 fed
 * "Teach Python for data scientists, intermediate level, 6 hours, English" and
 * expected `ready`, while the shipped prompt names exactly that case
 * `not_ready` ("simply providing the topic/initial details while the assistant
 * has just proposed a draft"). Correctly wired, the old set would have scored
 * the node against a contract the node does not have.
 *
 * So a row is pinned on three axes: it carries the turn the node reads, it
 * expects one of the node's own three decisions, and it declares whether it is
 * supposed to reach the model at all.
 */

type Decision = "ready" | "not_ready" | "ask";

type Row = {
	id: string;
	category: "classified" | "early-return";
	/** Only on `early-return` rows: which guard clause the row exercises. */
	guard?: "empty-message" | "revise" | "clarify";
	currentStep: string;
	intent: "continue" | "revise" | "clarify";
	history: { role: string; content: string; step: string }[];
	userMessage: string;
	assistantText: string;
	expected: { decision: Decision };
};

const rows: Row[] = readFileSync(
	resolve(process.cwd(), "evals/datasets/courseAI/assessCompletion.jsonl"),
	"utf-8",
)
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

const classified = rows.filter((row) => row.category === "classified");
const earlyReturn = rows.filter((row) => row.category === "early-return");

const DECISIONS: Decision[] = ["ready", "not_ready", "ask"];

/**
 * The fields whose author is speaking **as the user**. `assistantText` is
 * deliberately absent: in production it is the model's own previous turn, and a
 * realistic one summarises and counts ("4 sections with 11 lessons total"). The
 * authoring rule binds what the row's author writes in the instructor's voice,
 * not what the assistant is depicted as having said.
 */
const authoredAsUser = rows.flatMap((row) => [
	{ label: `${row.id}/userMessage`, content: row.userMessage },
	...row.history
		.filter((message) => message.role === "user")
		.map((message, index) => ({
			label: `${row.id}/history[${index}]`,
			content: message.content,
		})),
]);

/**
 * Shared with `confidenceScoreDataset.contract.test.ts` in intent, not in code:
 * the two sets grade different things and their vocabularies drift apart.
 *
 * Grading words are never authentic here — a turn that says "proceed" or "change
 * this" has no reason to appraise the draft — so they are forbidden in every
 * user-authored field.
 */
const VERDICT_WORDS =
	/\b(vague|unclear|incomplete|partial|comprehensive|solid|well[- ]structured|thorough|minimal|sparse|generic|placeholder|TBD|detailed|rich)\b/i;

/**
 * A count of what the draft contains is only a leak **in the decision turn**:
 * "4 solid objectives" there is the author describing the row's own answer.
 * In `history` it is the opposite — an instructor who typed
 * "Ch1: React basics (3 lessons), Ch2: State management (2 lessons)" wrote the
 * curriculum, and forbidding that would forbid the realistic context the node
 * reads. Found by running this test against the old set, which failed on exactly
 * such a turn.
 */
const COUNTS_THE_DRAFT =
	/\b\d+[\s-]+\w*[\s-]*(objectives?|sections?|lessons?|prereqs?|requirements?)\b/i;

/** The turn whose author knows the expected decision: only this one. */
const decisionTurns = rows.map((row) => ({
	label: `${row.id}/userMessage`,
	content: row.userMessage,
}));

describe("assessCompletion rows carry the turn the node reads", () => {
	it("finds rows to check", () => {
		expect(rows.length).toBeGreaterThanOrEqual(20);
	});

	it.each(
		rows.map((row) => [row.id, row.category] as const),
	)("%s declares whether it reaches the model", (_id, category) => {
		expect(["classified", "early-return"]).toContain(category);
	});

	/**
	 * The one row allowed an empty message is the row whose whole subject is the
	 * empty-message guard, and it has to say so. Without the `guard` field this
	 * assertion is a loophole rather than an exception.
	 */
	it.each(
		rows.map((row) => [`${row.id}/${row.category}`, row] as const),
	)("%s has a user turn unless it is the empty-message guard", (_label, row) => {
		if (row.category === "early-return" && row.guard === "empty-message") {
			expect(row.userMessage).toBe("");
			return;
		}

		expect(row.userMessage.trim().length).toBeGreaterThan(0);
	});

	/**
	 * A `classified` row carrying `revise`/`clarify` intent, or no message, can
	 * never reach the provider — it would be scored as the model's answer while
	 * being the guard's. That is P2 in miniature, one row at a time.
	 */
	it.each(
		classified.map((row) => [row.id, row] as const),
	)("%s can actually reach the model", (_id, row) => {
		expect(row.intent).toBe("continue");
		expect(row.userMessage.trim().length).toBeGreaterThan(0);
	});
});

describe("assessCompletion rows expect the node's own decisions", () => {
	it.each(
		rows.map((row) => [row.id, row] as const),
	)("%s names one of ready / not_ready / ask", (_id, row) => {
		expect(DECISIONS).toContain(row.expected.decision);
	});

	/** The retired boolean. A row keeping it is a row nobody re-expressed. */
	it.each(
		rows.map((row) => [row.id, row] as const),
	)("%s no longer carries the retired `expected.ready`", (_id, row) => {
		expect(row.expected).not.toHaveProperty("ready");
	});

	it("exercises all three decisions on rows that reach the model", () => {
		expect(
			[...new Set(classified.map((row) => row.expected.decision))].sort(),
		).toEqual([...DECISIONS].sort());
	});

	/**
	 * `precisionGate` divides by the rows predicted `ready`, so the `ready` class
	 * is the denominator its 0.9 threshold acts on. At three rows a single false
	 * positive is a 33-point swing and the gate reports noise; eight is the floor
	 * at which one false positive lands just under the threshold, which is the
	 * strictness the criterion asks for.
	 */
	it("holds enough ready rows for the 0.9 precision gate to mean something", () => {
		expect(
			classified.filter((row) => row.expected.decision === "ready").length,
		).toBeGreaterThanOrEqual(8);
	});
});

describe("the guard that hid the defect is pinned by rows, not by absence", () => {
	it("has a row for every clause of the node's early return", () => {
		expect([...new Set(earlyReturn.map((row) => row.guard))].sort()).toEqual([
			"clarify",
			"empty-message",
			"revise",
		]);
	});

	it.each(
		earlyReturn.map((row) => [`${row.id}/${row.guard}`, row] as const),
	)("%s expects the guard's answer, not the model's", (_label, row) => {
		expect(row.expected.decision).toBe("not_ready");
	});

	it.each(
		earlyReturn.map((row) => [`${row.id}/${row.guard}`, row] as const),
	)("%s sets the state its guard clause reads", (_label, row) => {
		if (row.guard === "empty-message") expect(row.intent).toBe("continue");
		else expect(row.intent).toBe(row.guard);
	});
});

describe("assessCompletion rows are written in the instructor's voice", () => {
	it.each(
		authoredAsUser.map((m) => [m.label, m.content] as const),
	)("%s grades nothing", (_label, content) => {
		expect(content).not.toMatch(VERDICT_WORDS);
	});

	it.each(
		decisionTurns.map((m) => [m.label, m.content] as const),
	)("%s counts nothing in the draft", (_label, content) => {
		expect(content).not.toMatch(COUNTS_THE_DRAFT);
	});
});
