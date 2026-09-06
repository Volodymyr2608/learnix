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
	/** The staged conversation the turn answers. Rows sharing one are identical
	 * in every field but `userMessage`, `intent` and the expectation. */
	context: string;
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
 *
 * That exemption used to be a promise. The first version of this set kept it and
 * still leaked: every `ready` row's `assistantText` was a settled confirmation,
 * every `not_ready` row's was the change already carried out, and all four `ask`
 * rows ended in an either/or question — so the field predicted the label
 * perfectly and a model ignoring `userMessage` entirely could have scored 20/20.
 * Found in review, not by a regex, because no regex can see stance.
 *
 * The exemption is now backed by construction instead: rows are grouped into
 * *contexts*, every row in a context carries byte-identical `history` and
 * `assistantText`, and each proposal context carries all three decisions. The
 * field cannot correlate with the label because it does not vary with it. That
 * is what `describe("the staged context cannot predict the label")` pins.
 */
const authoredAsUser = rows.flatMap((row) => [
	{ label: `${row.id}/userMessage`, content: row.userMessage },
	...row.history
		.map((message, index) => ({ ...message, index }))
		.filter((message) => message.role === "user")
		.map((message) => ({
			label: `${row.id}/history[${message.index}]`,
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

	/**
	 * The other two counts are gate parameters as well, and only the `ask` one is
	 * obviously so: at a single `ask` row, a total collapse of the clarify path
	 * still scores 19/20 = 95% and clears the 0.85 gate untouched. Four is what
	 * makes that failure land at 80% and redden the run. `not_ready` carries the
	 * margin for the whole category, so it is pinned for the same reason.
	 */
	it.each([
		["ask", 4],
		["not_ready", 8],
	] as const)("holds at least %d %s rows, because the gate needs them", (decision, floor) => {
		expect(
			classified.filter((row) => row.expected.decision === decision).length,
		).toBeGreaterThanOrEqual(floor);
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

describe("the staged context cannot predict the label", () => {
	const contexts = [...new Set(rows.map((row) => row.context))];
	const proposals = contexts.filter((name) => name.endsWith("-proposal"));

	it.each(
		contexts.map((name) => [name] as const),
	)("%s stages one conversation, byte for byte", (name) => {
		const inContext = rows.filter((row) => row.context === name);
		const staged = new Set(
			inContext.map((row) =>
				JSON.stringify({
					history: row.history,
					assistantText: row.assistantText,
					currentStep: row.currentStep,
				}),
			),
		);

		expect(staged.size).toBe(1);
	});

	/**
	 * `assistantText` is the reply to **this** turn — the node appends it after
	 * `userMessage` (`assessCompletion.ts:44-53`), so it is not the proposal that
	 * preceded the turn; that lives in `history`. A realistic reply therefore
	 * reacts to the very message being judged, which is why the first version of
	 * this set leaked through it and the second, which staged the proposal there,
	 * pushed the node toward `ask` on rows that were not ambiguous.
	 *
	 * Held to one constant across the whole file instead. The realism cost is
	 * stated rather than hidden: no run here measures what the node does with an
	 * informative reply. What it buys is that every decision the run scores is
	 * attributable to `userMessage` alone.
	 */
	it("holds the assistant's reply constant across the whole set", () => {
		expect([...new Set(rows.map((row) => row.assistantText))]).toHaveLength(1);
	});

	/**
	 * The negative control, and the reason the whole set is arranged this way: if
	 * one staged conversation leads to all three decisions, then nothing outside
	 * `userMessage` can carry the answer.
	 */
	it.each(
		proposals.map((name) => [name] as const),
	)("%s carries all three decisions on the same staged conversation", (name) => {
		const decisions = rows
			.filter((row) => row.context === name && row.category === "classified")
			.map((row) => row.expected.decision);

		expect([...new Set(decisions)].sort()).toEqual([...DECISIONS].sort());
	});

	/**
	 * `conversation-start` is single-label on purpose and is the one context
	 * exempt from the rule above: the shipped prompt says not to ask when the
	 * conversation has only just started, so nothing there can be `ready` or
	 * `ask`. Its rows exist to be the minimal pair — the same acknowledgement
	 * that means `ask` after a proposal means `not_ready` here.
	 */
	it("pairs an ambiguous acknowledgement across two contexts", () => {
		const acknowledgements = classified.filter(
			(row) => row.userMessage.trim().split(/\s+/).length === 1,
		);
		const byWord = new Map<string, Set<string>>();
		for (const row of acknowledgements) {
			const word = row.userMessage.trim().toLowerCase();
			byWord.set(
				word,
				(byWord.get(word) ?? new Set()).add(row.expected.decision),
			);
		}

		expect([...byWord.values()].some((decisions) => decisions.size > 1)).toBe(
			true,
		);
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
