import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import { accuracyGate, type EvalResult } from "../_shared/score";

type Row = {
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

const DATASET_PATH = resolve(
	process.cwd(),
	"evals/datasets/courseAI/classifyIntent.jsonl",
);

const loadDataset = (): Row[] =>
	readFileSync(DATASET_PATH, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Row);

export async function runClassifyIntentEval(): Promise<boolean> {
	const data = loadDataset();
	const results: EvalResult[] = await Promise.all(
		data.map(async (row) => {
			const out = await classifyIntent({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[row.currentStep],
				content: {},
				history: row.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "chat",
				userMessage: row.userMessage,
				intent: null,
				reviseTarget: null,
				toolCalls: [],
				pendingToolCalls: [],
				assessReady: false,
				assessClarify: null,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
				messages: [],
			});
			const ok =
				out.intent === row.expected.intent &&
				(out.reviseTarget ?? null) ===
					(row.expected.reviseTarget
						? DraftStep[row.expected.reviseTarget]
						: null);
			return { id: row.id, ok };
		}),
	);
	return accuracyGate("classifyIntent", results, 0.85);
}
