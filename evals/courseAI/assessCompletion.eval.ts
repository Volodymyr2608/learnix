import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { assessCompletion } from "@/server/services/courseAI/graph/nodes/assessCompletion";
import {
	type CategoryEvalResult,
	categoryGate,
	formatRowOutcomes,
	precisionGate,
	type SampleOutcome,
} from "../_shared/score";
import {
	callCoverage,
	reportRunUsage,
	startRunUsage,
	usageRecorder,
} from "../_shared/usage";

type Outcome = SampleOutcome & CategoryEvalResult;

export type Decision = "ready" | "not_ready" | "ask";

type Row = {
	id: string;
	category: "classified" | "early-return";
	guard?: "empty-message" | "revise" | "clarify";
	currentStep: keyof typeof DraftStep;
	intent: "continue" | "revise" | "clarify";
	history: {
		role: "user" | "assistant";
		content: string;
		step: keyof typeof DraftStep;
	}[];
	userMessage: string;
	assistantText: string;
	expected: { decision: Decision };
};

/**
 * The node's decision, read back from the two fields it writes. `ask` is the
 * one that has to be recovered: it sets `assessClarify` and leaves
 * `assessReady` false, so a run scoring the boolean alone cannot tell a
 * clarifying question from a refusal to advance.
 */
export const decisionOf = (out: {
	assessReady: boolean;
	assessClarify: string | null;
}): Decision => {
	if (out.assessReady) return "ready";
	if (out.assessClarify !== null) return "ask";
	return "not_ready";
};

/**
 * `early-return` is gated at 1.0 rather than left ungated: those rows never
 * reach the provider, so nothing about them can drift. They are also the clause
 * that hid this eval's own defect for months, which is the argument for pinning
 * them by rows instead of by their absence.
 */
const GATES = { classified: 0.85, "early-return": 1 };

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/courseAI/assessCompletion.jsonl",
);

/**
 * Until 2026-09-06 this eval passed `userMessage: ""` — the exact field the
 * node's first guard tests — so every row returned on line one, no row reached
 * the model, and the old empty-set branch of `precisionGate` printed 100% over
 * zero calls. The three things that make that irreproducible are all here: the
 * turn comes from the row, the guard rows are a scored category of their own,
 * and `callCoverage` is ANDed into the verdict rather than merely printed.
 */
export async function runAssessCompletionEval(): Promise<boolean> {
	const recorder = usageRecorder();
	const startedAt = startRunUsage();
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results: Outcome[] = await Promise.all(
		rows.map(async (r) => {
			const out = await assessCompletion(
				{
					generationId: "eval",
					instructorId: "eval",
					currentStep: DraftStep[r.currentStep],
					content: {},
					history: r.history.map((h) => ({ ...h, step: DraftStep[h.step] })),
					mode: "chat",
					userMessage: r.userMessage,
					intent: r.intent,
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
					outputRejected: false,
					messages: [],
				},
				recorder.config,
			);

			const decision = decisionOf({
				assessReady: out.assessReady ?? false,
				assessClarify: out.assessClarify ?? null,
			});

			return {
				id: r.id,
				category: r.category,
				ok: decision === r.expected.decision,
				expected: r.expected.decision,
				actual: decision,
			};
		}),
	);

	// Counted before `reportRunUsage`, which drains the book — and counted, not
	// taken, so the cost line still has its calls to report.
	const modelCalls = recorder.countCalls();
	const classifiedRows = rows.filter(
		(row) => row.category === "classified",
	).length;

	// The concurrency the latencies were queued at is the number of rows that
	// actually issued a request: the guard rows resolve without a provider call.
	reportRunUsage(recorder, startedAt, classifiedRows);

	// The score is only the model's if the model was asked. This eval printed
	// 100% over zero calls because nothing here compared the two.
	const coverage = callCoverage(modelCalls, classifiedRows);
	if (coverage.message) {
		const say = coverage.ok ? console.log : console.error;
		say(`\n  coverage:  ${coverage.message}`);
	}

	console.log(
		`\nassessCompletion — ${rows.length} rows (${classifiedRows} reach the model, ${
			rows.length - classifiedRows
		} exercise the early return) at the temperature the node ships (0)`,
	);

	const outcomes = formatRowOutcomes(results);
	if (outcomes)
		console.log(`\nassessCompletion — what the node decided:\n${outcomes}`);

	const rateHeld = categoryGate("assessCompletion", results, GATES);

	// Precision over every row, not only the classified ones: a guard row that
	// somehow advanced is the most serious false positive this set can produce.
	const precisionHeld = precisionGate(
		"assessCompletion",
		results.map((row) => ({
			id: row.id,
			predicted: row.actual === "ready",
			expected: row.expected === "ready",
		})),
		0.9,
	);

	return rateHeld && precisionHeld && coverage.ok;
}
