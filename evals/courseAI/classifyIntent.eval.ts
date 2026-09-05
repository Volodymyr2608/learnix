import { DraftStep } from "@/generated/prisma";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import {
	type CategoryEvalResult,
	categoryGate,
	flakyRows,
	formatRowOutcomes,
	rowStability,
	type SampleOutcome,
} from "../_shared/score";
import { reportRunUsage, startRunUsage, usageRecorder } from "../_shared/usage";
import { categoryOf, loadClassifyIntentRows } from "./classifyIntentRows";

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
	reportRunUsage(recorder, startedAt, attempts.length);

	console.log(
		`\nclassifyIntent — ${data.length} rows x ${SAMPLES} samples at the temperature the node ships (0)`,
	);

	const outcomes = formatRowOutcomes(results);
	if (outcomes)
		console.log(`\nclassifyIntent — what the node returned:\n${outcomes}`);

	// Two facts a single draw cannot produce, and they are different facts: a row
	// that never passes is a defect, a row that passes sometimes is a coin. The
	// table above says what was returned; this says how reliably.
	const stability = rowStability(results);
	const never = stability.filter((row) => row.passed === 0);
	const flaky = flakyRows(stability);

	console.log(
		`  fails every sample:  ${never.map((row) => row.id).join(", ") || "none"}`,
	);
	console.log(
		`  flaky:               ${
			flaky
				.map((row) => `${row.id} (${row.passed}/${row.samples})`)
				.join(", ") || "none"
		}`,
	);

	return categoryGate("classifyIntent", results, GATES);
}
