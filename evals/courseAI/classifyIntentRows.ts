import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DraftStep } from "@/generated/prisma";

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
 * Derived from the row rather than stored in the JSONL, and mirroring the node's
 * condition at `classifyIntent.ts:64` deliberately. A stored `category` field
 * would be a second copy of what `history: []` already says, and it would
 * disagree with the predicate the first time either of them moved.
 */
export const categoryOf = (row: Row): "classified" | "early-return" =>
	row.history.length === 0 || !row.userMessage ? "early-return" : "classified";

const DATASET_PATH = resolve(
	process.cwd(),
	"evals/datasets/courseAI/classifyIntent.jsonl",
);

export const loadClassifyIntentRows = (): Row[] =>
	readFileSync(DATASET_PATH, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Row);
