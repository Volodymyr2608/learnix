import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../_shared/promptFidelity";

/**
 * The prompt may not carry the set that grades it.
 *
 * The same guard `confidence_score` has, for the same reason and against a
 * sharper temptation. Three of the seventeen scored rows are the ones this
 * reopening is fixing, and they are quotable: *"also add an objective about
 * machine learning concepts"*, *"knowledge of statistics"*, *"one more
 * objective"*. A rule written around those words would take the gate to green
 * while teaching the node nothing about the class — and the class is exactly
 * what has to generalise, because the next instructor phrases it differently.
 *
 * Mechanical rather than tasteful, as the sibling is: any value the set carries,
 * of at least two words and six characters, must not appear in the node's source
 * with comments stripped. Two words because a single domain noun ("objectives",
 * "curriculum") is the vocabulary a routing prompt is entitled to use; six
 * characters because a shorter fragment is not recognisably from this set.
 */

const PROMPT_SOURCE = resolve(
	process.cwd(),
	"server/services/courseAI/graph/nodes/classifyIntent.ts",
);

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/classifyIntent.jsonl",
);

type Row = {
	userMessage: string;
	history: { content: string }[];
};

/**
 * Folds every non-alphanumeric run to one space, not just whitespace: the
 * realistic way a row slips past this check is a hyphen, not cunning.
 */
const normalise = (text: string): string =>
	text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const isRecognisable = (text: string): boolean =>
	text.length >= 6 && text.split(" ").length >= 2;

const rows: Row[] = readFileSync(DATASET, "utf-8")
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line));

const literals = [
	...new Set(
		rows
			.flatMap((row) => [
				row.userMessage,
				...row.history.map((message) => message.content),
			])
			.map(normalise)
			.filter(isRecognisable),
	),
];

/** The check itself, so the cases below can prove it bites. */
const mentionsDataset = (source: string): string[] => {
	const prompt = normalise(stripComments(source));
	return literals.filter((literal) => prompt.includes(literal));
};

describe("the intent prompt does not carry the golden set", () => {
	it("extracted enough literals for the check to mean something", () => {
		// 37 today. A dataset reshape that emptied this list would leave every
		// case below passing vacuously — the failure mode of every allowlist.
		expect(literals.length).toBeGreaterThanOrEqual(30);
	});

	it("finds none of them in the node's prompt", () => {
		expect(mentionsDataset(readFileSync(PROMPT_SOURCE, "utf-8"))).toEqual([]);
	});

	it("catches a pasted row value", () => {
		const [pasted] = literals;
		expect(pasted).toBeDefined();

		const source = `const prompt = "Classify the turn. Treat ${pasted} as a revise.";`;

		expect(mentionsDataset(source)).toContain(pasted);
	});

	/**
	 * A row quoted in a doc comment is a note to the next reader, not an
	 * instruction to the model — the same allowance `promptFidelity` makes, and
	 * the reason the node can keep explaining which rows drove a wording.
	 */
	it("allows the same words inside a comment", () => {
		const [pasted] = literals;
		expect(pasted).toBeDefined();

		const source = `// the failing row here was ${pasted}\nconst prompt = "Classify the turn.";`;

		expect(mentionsDataset(source)).toEqual([]);
	});
});
