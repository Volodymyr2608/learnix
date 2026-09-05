import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import {
	CONFIDENCE_THRESHOLD,
	confidenceScore,
} from "@/server/services/courseAI/graph/nodes/confidenceScore";
import {
	accuracyGate,
	type EvalResult,
	formatScoreTable,
	retentionGate,
} from "../_shared/score";
import { reportRunUsage, startRunUsage, usageRecorder } from "../_shared/usage";

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

	// What this node costs is the point of the run, not a footnote to it: the
	// open task on it (area-4 З2/З3) is a prompt that carries step-scoped history
	// into every call, and "did the score hold" cannot decide that on its own.
	const recorder = usageRecorder();
	const startedAt = startRunUsage();

	const raw = await Promise.all(
		rows.map(async (r) => {
			const out = await confidenceScore(
				{
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
					outputRejected: false,
					messages: [],
				},
				// The node forwards its config to `model.invoke`, so the recorder
				// reaches the call without the eval having to reconstruct it.
				recorder.config,
			);
			return {
				id: r.id,
				score: out.confidence ?? 0,
				expected: r.expected.complete,
			};
		}),
	);

	console.log(
		`High-confidence predictions: ${raw.filter((r) => r.score >= CONFIDENCE_THRESHOLD).length}/${raw.length}`,
	);
	// Printed before the gate, because the gate's verdict is not the finding —
	// the shape of the distribution is. See `formatScoreTable`.
	console.log(`\nScores, highest first:`);
	console.log(formatScoreTable(raw, CONFIDENCE_THRESHOLD));

	reportRunUsage(recorder, startedAt, rows.length);

	// Calibration: among high-confidence predictions (score≥0.8), measure fraction that are actually complete
	const highConf: EvalResult[] = raw
		.filter((r) => r.score >= CONFIDENCE_THRESHOLD)
		.map((r) => ({ id: r.id, ok: r.expected }));

	const precise = accuracyGate(
		"confidenceScore calibration (score≥0.8 → complete)",
		highConf,
		0.85,
	);

	// Both gates run before either verdict is returned: a red run should say
	// which half moved, and short-circuiting hides the half that did not.
	// floor 10 of the set's 11 complete rows — one row of provider drift, no
	// more. `confidenceScoreDataset.contract.test.ts` pins that count, since a
	// grown set would make this floor trivially satisfiable and quietly turn the
	// run back into a precision-only gate.
	const retained = retentionGate("confidenceScore", raw, {
		threshold: CONFIDENCE_THRESHOLD,
		floor: 10,
	});

	return precise && retained;
}
