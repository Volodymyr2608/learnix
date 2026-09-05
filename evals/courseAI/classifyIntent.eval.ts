import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DraftStep } from "@/generated/prisma";
import { classifyIntent } from "@/server/services/courseAI/graph/nodes/classifyIntent";
import {
	accuracyGate,
	formatRowOutcomes,
	type SampleOutcome,
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

const loadDataset = (): Row[] =>
	readFileSync(DATASET_PATH, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Row);

export async function runClassifyIntentEval(): Promise<boolean> {
	const recorder = usageRecorder();
	const startedAt = startRunUsage();
	const data = loadDataset();
	const results: SampleOutcome[] = await Promise.all(
		data.map(async (row) => {
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
				ok,
				expected: answer(row.expected.intent, expectedTarget),
				actual: answer(out.intent, actualTarget),
			};
		}),
	);
	reportRunUsage(recorder, startedAt, data.length);

	const outcomes = formatRowOutcomes(results);
	if (outcomes)
		console.log(`\nclassifyIntent — what the node returned:\n${outcomes}`);

	return accuracyGate("classifyIntent", results, 0.85);
}
