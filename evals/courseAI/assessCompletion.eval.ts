import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { assessCompletion } from "@/server/services/courseAI/graph/nodes/assessCompletion";
import { precisionGate } from "../_shared/score";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: {
		role: "user" | "assistant";
		content: string;
		step: keyof typeof DraftStep;
	}[];
	assistantText: string;
	expected: { ready: boolean };
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/assessCompletion.jsonl",
);

export async function runAssessCompletionEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await assessCompletion({
				generationId: "eval",
				instructorId: "eval",
				currentStep: DraftStep[r.currentStep],
				content: {},
				history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
				mode: "chat",
				userMessage: "",
				intent: "continue",
				reviseTarget: null,
				toolCalls: [],
				pendingToolCalls: [],
				assessReady: false,
				assessClarify: null,
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: r.assistantText,
				validationErrors: null,
				messages: [],
			});
			return {
				id: r.id,
				predicted: out.assessReady ?? false,
				expected: r.expected.ready,
			};
		}),
	);
	return precisionGate("assessCompletion", results, 0.9);
}
