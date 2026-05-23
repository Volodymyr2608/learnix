import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { confidenceScore } from "@/server/services/courseAI/graph/nodes/confidenceScore";

type Row = {
	id: string;
	currentStep: keyof typeof DraftStep;
	history: {
		role: "user" | "assistant";
		content: string;
		step: keyof typeof DraftStep;
	}[];
	draftStepData: unknown;
	expected: { complete: boolean };
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/confidenceScore.jsonl",
);

export async function runConfidenceScoreEval() {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await confidenceScore({
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
				assessReady: true,
				draftStepData: r.draftStepData,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
			});
			return {
				id: r.id,
				score: out.confidence ?? 0,
				expected: r.expected.complete,
			};
		}),
	);

	const highConf = results.filter((r) => r.score >= 0.8);
	const completeAmongHigh = highConf.filter((r) => r.expected).length;
	const calibration =
		highConf.length === 0 ? 1 : completeAmongHigh / highConf.length;

	console.log(
		`confidenceScore calibration (score≥0.8 → complete): ${(calibration * 100).toFixed(1)}%`,
	);
	console.log(
		`High-confidence predictions: ${highConf.length}/${results.length}`,
	);
	if (calibration < 0.85) {
		console.error("FAIL: calibration below 0.85 threshold");
		process.exit(1);
	}
}
