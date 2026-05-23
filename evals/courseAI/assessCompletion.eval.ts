import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { assessCompletion } from "@/server/services/courseAI/graph/nodes/assessCompletion";

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

export async function runAssessCompletionEval() {
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
				draftStepData: undefined,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: r.assistantText,
				validationErrors: null,
			});
			return {
				id: r.id,
				predicted: out.assessReady ?? false,
				expected: r.expected.ready,
			};
		}),
	);

	const truePositives = results.filter((r) => r.predicted && r.expected).length;
	const falsePositives = results.filter(
		(r) => r.predicted && !r.expected,
	).length;
	const precision =
		truePositives + falsePositives === 0
			? 1
			: truePositives / (truePositives + falsePositives);

	console.log(
		`assessCompletion precision on ready=true: ${(precision * 100).toFixed(1)}%`,
	);
	console.log(
		"False positives:",
		results.filter((r) => r.predicted && !r.expected).map((r) => r.id),
	);
	if (precision < 0.9) {
		console.error("FAIL: precision below 0.9 threshold");
		process.exit(1);
	}
}
