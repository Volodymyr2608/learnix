import { DraftStep } from "@/generated/prisma";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import {
	alwaysFailingGate,
	type CategoryEvalResult,
	categoryGate,
	flakyRows,
	formatRowOutcomes,
	rowStability,
	type SampleOutcome,
} from "../_shared/score";
import {
	callCoverage,
	reportRunUsage,
	startRunUsage,
	usageRecorder,
} from "../_shared/usage";
import {
	categoryOf,
	loadClassifyIntentRows,
	priorStepContent,
} from "./classifyIntentRows";

type Outcome = SampleOutcome & CategoryEvalResult;

/**
 * `early-return` is gated at 1.0 rather than left ungated: those rows never
 * reach the provider, so nothing about them can drift. A deterministic branch
 * that starts failing is a defect on the first draw, and a threshold below 1
 * would be pretending otherwise.
 */
const GATES = { classified: 0.85, "early-return": 1 };

/**
 * Draws per row. Three is the smallest number that can tell "always", "never"
 * and "sometimes" apart, and it is what `tutor` and `aiOutput/*` already sample.
 *
 * Not a preference. Three single-sample runs of unchanged code returned 90.0%,
 * 85.0% and 80.0% against an 0.85 gate — green, on the line, and red. A prompt
 * change measured against that cannot be told from provider drift in either
 * direction, so the instrument is fixed before the prompt is.
 *
 * `docFigures.sampledEvals()` detects this constant, not a hand-kept list, so
 * the prose in `ai-eval-strategy.md` that counts single-sample evals moves with
 * it or the unit suite goes red.
 */
const SAMPLES = 3;

/**
 * The node's answer as one string — intent and resolved target together.
 *
 * They are one decision, not two: `revise` with the wrong target and `revise`
 * with no target are different failures, and reporting the intent alone would
 * call all three of them "wrong intent".
 *
 * `intent` is widened to include the absent case because the node's return is a
 * partial state: a node that returned no intent at all is a fourth outcome, and
 * printing it as `none` is more honest than coercing it into one of the three.
 */
const answer = (
	intent: string | null | undefined,
	target: string | null,
): string => `${intent ?? "none"}:${target ?? "none"}`;

export async function runClassifyIntentEval(): Promise<boolean> {
	const recorder = usageRecorder();
	const startedAt = startRunUsage();
	const data = loadClassifyIntentRows();
	const attempts = data.flatMap((row) =>
		Array.from({ length: SAMPLES }, () => row),
	);

	const results: Outcome[] = await Promise.all(
		attempts.map(async (row) => {
			const out = await classifyIntent(
				{
					generationId: "eval",
					instructorId: "eval",
					currentStep: DraftStep[row.currentStep],
					content: priorStepContent(row),
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
					outputRejected: false,
					messages: [],
				},
				recorder.config,
			);

			const expectedTarget = row.expected.reviseTarget
				? DraftStep[row.expected.reviseTarget]
				: null;
			const actualTarget = out.reviseTarget ?? null;
			const ok =
				out.intent === row.expected.intent && actualTarget === expectedTarget;

			return {
				id: row.id,
				category: categoryOf(row),
				ok,
				expected: answer(row.expected.intent, expectedTarget),
				actual: answer(out.intent, actualTarget),
			};
		}),
	);
	// Counted before `reportRunUsage`, which drains the book — and counted, not
	// taken, so the cost line below still has its calls to report.
	const modelCalls = recorder.countCalls();
	const classifiedSamples = results.filter(
		(row) => row.category === "classified",
	).length;

	// The concurrency the latencies were queued at is the number of samples that
	// actually issued a request, not the number fired at the node: the
	// `early-return` rows resolve without touching the provider.
	reportRunUsage(recorder, startedAt, classifiedSamples);

	// The score is only the model's if the model was asked. `assessCompletion`
	// printed 100% over zero calls because nothing checked that.
	const coverage = callCoverage(modelCalls, classifiedSamples);
	if (coverage.message) {
		const say = coverage.ok ? console.log : console.error;
		say(`\n  coverage:  ${coverage.message}`);
	}

	console.log(
		`\nclassifyIntent — ${data.length} rows x ${SAMPLES} samples at the temperature the node ships (0)`,
	);

	const outcomes = formatRowOutcomes(results);
	if (outcomes)
		console.log(`\nclassifyIntent — what the node returned:\n${outcomes}`);

	// A row that passes sometimes is a coin, and a single draw reports it as a
	// confident boolean either way. The rows that never pass are named by
	// `alwaysFailingGate` below, which also fails the run for them.
	const stability = rowStability(results);
	const flaky = flakyRows(stability);

	console.log(
		`  flaky:  ${
			flaky
				.map((row) => `${row.id} (${row.passed}/${row.samples})`)
				.join(", ") || "none"
		}`,
	);

	// Both, and neither short-circuits: a run that fails the rate should still
	// print which rows are broken outright, because they are different repairs.
	const rateHeld = categoryGate("classifyIntent", results, GATES);
	const floorHeld = alwaysFailingGate("classifyIntent", stability, GATES);

	return rateHeld && floorHeld && coverage.ok;
}
