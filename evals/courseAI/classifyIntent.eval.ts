import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate } from "langsmith/evaluation";
import { DraftStep } from "@/generated/prisma";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";

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

export async function runClassifyIntentEval() {
	const data = loadDataset();
	const results = await Promise.all(
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
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
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
	const accuracy = results.filter((r) => r.ok).length / results.length;
	console.log(`classifyIntent accuracy: ${(accuracy * 100).toFixed(1)}%`);
	console.log(
		"Failures:",
		results.filter((r) => !r.ok).map((r) => r.id),
	);
	if (accuracy < 0.85) {
		console.error("FAIL: classifyIntent accuracy below 0.85 threshold");
		process.exit(1);
	}
	void evaluate;
}
