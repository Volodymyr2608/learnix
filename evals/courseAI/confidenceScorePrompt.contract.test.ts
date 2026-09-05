import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../_shared/promptFidelity";

/**
 * The prompt may not contain the answers to the set that grades it.
 *
 * `confidenceScoreDataset.contract.test.ts` keeps the author's verdict out of
 * the DATA. This is the same defect approached from the other side: four of the
 * twenty rows are the ones the calibration fix was measured against, so a prompt
 * that names their contents — "score a one-objective step about a snake-named
 * language low" — would move the gate from 73.3% to green while fixing nothing
 * about the node's judgement. The eval would then be a lookup table with a
 * model attached.
 *
 * The rule is deliberately mechanical rather than tasteful: any value the set
 * carries, of at least two words and six characters, must not appear in the
 * node's source with comments stripped. Two words because a single common noun
 * ("objectives", "curriculum") is the vocabulary of the domain and belongs in a
 * prompt; six characters because a two-word fragment shorter than that is not
 * recognisably from this set.
 */

const PROMPT_SOURCE = resolve(
	process.cwd(),
	"server/services/courseAI/graph/nodes/confidenceScore.ts",
);

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/confidenceScore.jsonl",
);

type Row = {
	id: string;
	history: { content: string }[];
	draftStepData: unknown;
};

/** Every string the row carries, however deeply the step's shape nests it. */
const strings = (value: unknown): string[] => {
	if (typeof value === "string") return [value];
	if (Array.isArray(value)) return value.flatMap(strings);
	if (value && typeof value === "object")
		return Object.values(value).flatMap(strings);
	return [];
};

/**
 * Folds every non-alphanumeric run to one space, not just whitespace.
 *
 * The realistic way to smuggle a row past this check is not cunning, it is a
 * hyphen: `learn-python` in a prompt would slip through a whitespace-only
 * normaliser while `learn python` is caught. Folding punctuation on both sides
 * strictly widens the net and costs nothing — the literals this set carries are
 * words, not syntax.
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
				...row.history.map((message) => message.content),
				...strings(row.draftStepData),
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

describe("the confidence prompt does not carry the golden set", () => {
	it("extracted enough literals for the check to mean something", () => {
		// A dataset reshape that emptied this list would leave every case below
		// passing vacuously — the failure mode of every allowlist.
		expect(literals.length).toBeGreaterThanOrEqual(30);
	});

	it("finds none of them in the node's prompt", () => {
		expect(mentionsDataset(readFileSync(PROMPT_SOURCE, "utf-8"))).toEqual([]);
	});

	it("catches a pasted row value", () => {
		const [pasted] = literals;
		expect(pasted).toBeDefined();

		const source = `const prompt = "Rate the step. A draft saying ${pasted} is not complete.";`;

		expect(mentionsDataset(source)).toContain(pasted);
	});

	/**
	 * A row quoted in a doc comment is a note to the next reader, not an
	 * instruction to the model — the same allowance `promptFidelity` makes.
	 */
	it("allows the same words inside a comment", () => {
		const [pasted] = literals;
		expect(pasted).toBeDefined();

		const source = `// the false positive here was ${pasted}\nconst prompt = "Rate the step.";`;

		expect(mentionsDataset(source)).toEqual([]);
	});
});
