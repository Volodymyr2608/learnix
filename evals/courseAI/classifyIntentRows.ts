import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { skipsModelCall } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import { getExtractionSchemaForStep } from "@/server/services/courseAI/validators/getExtractionSchemaForStep";

export type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: {
		role: "user" | "assistant";
		content: string;
		step: keyof typeof DraftStep;
	}[];
	userMessage: string;
	expected: {
		intent: "continue" | "revise";
		reviseTarget: keyof typeof DraftStep | null;
	};
};

/**
 * Which rows the model is asked about, and which it is not.
 *
 * `classify_intent` returns `continue` on its own first line when there is no
 * history or no user message — a first turn cannot revise anything. Those rows
 * exercise a real production branch and belong in the set, but scoring them
 * beside the rows the model classified inflates the gate by the fifteen points
 * they contribute for free. `categoryGate` is the existing answer: the two are
 * separate categories with separate thresholds.
 *
 * Derived from the row and read from the node's OWN predicate, not mirrored.
 * Two things were tempting here and both are second copies: a `category` field in
 * the JSONL duplicates what `history: []` already says, and a re-typed condition
 * duplicates `skipsModelCall`. Either would decide which rows are scored as the
 * model's while being free to disagree with the code that actually skips them.
 */
export const categoryOf = (row: Row): "classified" | "early-return" =>
	skipsModelCall(row) ? "early-return" : "classified";

const DATASET_PATH = resolve(
	process.cwd(),
	"evals/datasets/courseAI/classifyIntent.jsonl",
);

export const loadClassifyIntentRows = (): Row[] =>
	readFileSync(DATASET_PATH, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Row);

/**
 * What the earlier steps have already saved by the time this row happens.
 *
 * The set used to be run with `content: {}` on every row, so the node's
 * `ALREADY STORED` line always read "nothing stored yet". That is not a state
 * production reaches: `currentStep` is `requirements` precisely because `basic`
 * and `objectives` were settled. The one input the node is given to tell
 * "produced already" from "being collected now" was therefore constant across
 * the whole set, and could not separate any two rows in it.
 *
 * It was not a harmless omission. Row 16 returns `continue` three draws of three
 * with an empty content and `revise:requirements` three of three with this one —
 * it was being counted as a prompt defect and is not one.
 *
 * Derived from the step order rather than stored per row: a hand-written
 * `content` per row would be twenty more chances to disagree with `currentStep`,
 * and the invariant is mechanical. The values are placeholders and cannot leak a
 * label — the node joins the key NAMES into the prompt and never the values,
 * which `classifyIntent.test.ts` already asserts against a hostile `content`.
 */
export const priorStepContent = (row: Row): Record<string, unknown> => {
	const steps = Object.values(DraftStep);
	const before = steps.slice(0, steps.indexOf(DraftStep[row.currentStep]));

	return Object.fromEntries(
		before.flatMap((step) =>
			Object.keys(getExtractionSchemaForStep(step).shape).map((key) => [
				key,
				"stored",
			]),
		),
	);
};
