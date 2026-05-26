import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { confidenceScore } from "@/server/services/courseAI/graph/nodes/confidenceScore";
import { accuracyGate, type EvalResult } from "../_shared/score";

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

export async function runConfidenceScoreEval(): Promise<boolean> {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const raw = await Promise.all(
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
				assessClarify: null,
				draftStepData: r.draftStepData,
				confidence: 0,
				shouldAutoAdvance: false,
				assistantText: "",
				validationErrors: null,
				messages: [],
			});
			return {
				id: r.id,
				score: out.confidence ?? 0,
				expected: r.expected.complete,
			};
		}),
	);

	console.log(
		`High-confidence predictions: ${raw.filter((r) => r.score >= 0.8).length}/${raw.length}`,
	);

	// Calibration: among high-confidence predictions (score≥0.8), measure fraction that are actually complete
	const highConf: EvalResult[] = raw
		.filter((r) => r.score >= 0.8)
		.map((r) => ({ id: r.id, ok: r.expected }));

	return accuracyGate(
		"confidenceScore calibration (score≥0.8 → complete)",
		highConf,
		0.85,
	);
}
