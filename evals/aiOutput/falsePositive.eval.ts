import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { DraftStep } from "@/generated/prisma";
import { env } from "@/lib/env";
import type { AiFeature } from "@/server/services/_shared/aiGuard/types";
import { wrapUntrustedContent } from "@/server/services/_shared/aiGuard/wrapUntrusted";
import type { AiOutputRuleId } from "@/server/services/_shared/aiOutput";
import { validateModelText } from "@/server/services/_shared/aiOutput";
import { autoTransitionPrompt } from "@/server/services/courseAI/prompts/chatResponsePrompts";
import { MERGE_SYSTEM_PROMPT } from "@/server/services/learningPathAI/nodes/mergeAndExplain.node";
import { SYSTEM_PROMPT as TUTOR_SYSTEM_PROMPT } from "@/server/services/lessonAI/lessonAI.agent";
import { insightsChain } from "@/server/services/lessonInsightsAI/chains/parallel.chain";
import { QUIZ_INITIAL_SYSTEM_PROMPT } from "@/server/services/quizAI/quizAI.agent";

/**
 * How often does the output boundary reject text that is simply *about* prompt
 * injection, or that carries an ordinary off-origin link?
 *
 * The number has to exist before any surface starts failing closed on it. The
 * repo's own precedent is the argument: the tutor's boundary measured 17.5%
 * against an assumed ≤5%, and that was invisible until the corpus contained
 * ordinary requests. On the structured surfaces a false positive is worse than
 * noisy — a lesson whose insights generation trips a rule caches nothing, so
 * every later call regenerates and trips again.
 *
 * NOT GATED, deliberately (security.md S11). It prints a breakdown and returns
 * true. Wiring it to accuracyGate would turn a measurement into a threshold
 * before anyone had seen the measurement.
 *
 * ## What "the real chains" means here
 *
 * Every surface runs its REAL assembled system prompt and the real wrapping, at
 * the model and temperature production uses. Corpus text enters exactly where
 * untrusted content enters in production. What is stubbed is only the database:
 * lessonInsightsAI runs its true chain, while the tutor, quiz and path surfaces
 * receive the content directly instead of through their DB-backed tools. That
 * substitutes the tool plumbing, never the prompt or the boundary.
 *
 * Running `validateModelText` over the corpus text itself would measure an event
 * that cannot happen: `wrapUntrustedContent` escapes `<untrusted_data` before
 * the model ever sees it, so the tag can only reappear in output if the model
 * un-escapes it. That is the whole reason both the literal and the escaped form
 * are in the corpus.
 */

type Row = { id: string; kind: string; content: string };

/** The event is stochastic; one sample per row is an anecdote, not a rate. */
const SAMPLES = 3;

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/aiOutput/falsePositive.jsonl",
);

type Sample = {
	row: Row;
	feature: AiFeature;
	rejected: boolean;
	ruleId?: AiOutputRuleId;
};

const chat = (temperature: number) =>
	new ChatOpenAI({
		model: "gpt-4o-mini",
		temperature,
		apiKey: env.OPENAI_API_KEY,
		timeout: 60_000,
		maxRetries: 2,
	});

const textOf = async (
	system: string,
	human: string,
	temperature: number,
): Promise<string> => {
	const reply = await chat(temperature).invoke([
		{ role: "system", content: system },
		{ role: "human", content: human },
	]);
	return reply.content?.toString() ?? "";
};

/** One model call per surface, returning the model-authored text it produces. */
const SURFACES: Record<AiFeature, (row: Row) => Promise<string>> = {
	lessonAI: (row) =>
		textOf(
			// Function replacers for the same reason production uses them: a string
			// replacement expands `$'` and would splice the clause's own closing tag
			// into system-prompt position.
			TUTOR_SYSTEM_PROMPT.replace("{conceptConstraint}", () => "").replace(
				"{untrustedContext}",
				() => wrapUntrustedContent(row.content, "lesson_content"),
			),
			"Please answer the student's question about this lesson in two or three sentences.",
			0.3,
		),

	courseAI: (row) =>
		textOf(
			autoTransitionPrompt({
				step: DraftStep.basic,
				courseData: { title: "Defending LLM applications", notes: row.content },
			}),
			"Continue.",
			0.4,
		),

	quizAI: (row) =>
		textOf(
			QUIZ_INITIAL_SYSTEM_PROMPT.replace(/\{count\}/g, "3").replace(
				/\{level\}/g,
				"Intermediate",
			),
			`Lesson content:\n${wrapUntrustedContent(row.content, "lesson_content")}`,
			0,
		),

	lessonInsightsAI: async (row) => {
		const out = await insightsChain.invoke({
			content: wrapUntrustedContent(row.content, "lesson_content"),
		});
		return [
			out.summary.summary,
			...out.concepts.concepts.flatMap((c) => [c.name, c.explanation]),
			...out.glossary.glossary.flatMap((g) => [g.term, g.definition]),
		].join("\n");
	},

	learningPathAI: (row) =>
		textOf(
			MERGE_SYSTEM_PROMPT,
			`Candidate steps: ${wrapUntrustedContent(
				JSON.stringify([
					{ type: "NEW_LESSON", lessonId: "l1", lessonSummary: row.content },
				]),
				"path_candidates",
			)}`,
			0.3,
		),
};

const percent = (part: number, whole: number): string =>
	whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;

export const runFalsePositiveEval = async (): Promise<boolean> => {
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Row);

	const features = Object.keys(SURFACES) as AiFeature[];
	const samples: Sample[] = [];

	for (const feature of features) {
		for (const row of rows) {
			for (let i = 0; i < SAMPLES; i++) {
				let text: string;
				try {
					text = await SURFACES[feature](row);
				} catch (error) {
					console.log(`  ! ${feature}/${row.id} call failed: ${String(error)}`);
					continue;
				}

				const result = validateModelText(text, {
					feature,
					userId: "eval",
					emit: false,
				});
				samples.push({
					row,
					feature,
					rejected: !result.valid,
					...(result.valid ? {} : { ruleId: result.ruleId }),
				});
			}
		}
	}

	console.log(
		`\naiOutput:falsePositive — ${rows.length} legitimate rows x ${features.length} surfaces x ${SAMPLES} samples\n`,
	);

	console.log("Per surface:");
	for (const feature of features) {
		const mine = samples.filter((s) => s.feature === feature);
		const bad = mine.filter((s) => s.rejected);
		console.log(
			`  ${feature.padEnd(18)} ${String(bad.length).padStart(3)}/${String(mine.length).padStart(3)} rejected  ${percent(bad.length, mine.length)}`,
		);
	}

	console.log("\nPer rule:");
	const rules = [
		...new Set(samples.flatMap((s) => (s.ruleId ? [s.ruleId] : []))),
	];
	for (const rule of rules) {
		const hits = samples.filter((s) => s.ruleId === rule);
		console.log(
			`  ${rule.padEnd(20)} ${String(hits.length).padStart(3)}  ${percent(hits.length, samples.length)} of all samples`,
		);
	}

	console.log("\nPer corpus kind (rejected samples only):");
	const kinds = [...new Set(rows.map((r) => r.kind))];
	for (const kind of kinds) {
		const mine = samples.filter((s) => s.row.kind === kind);
		const bad = mine.filter((s) => s.rejected);
		if (bad.length === 0) continue;
		console.log(
			`  ${kind.padEnd(28)} ${String(bad.length).padStart(3)}/${String(mine.length).padStart(3)}  ${percent(bad.length, mine.length)}`,
		);
	}

	const worst = samples.filter((s) => s.rejected).slice(0, 15);
	if (worst.length > 0) {
		console.log("\nFirst rejected samples (surface / row / rule):");
		for (const s of worst) {
			console.log(
				`  ${s.feature.padEnd(18)} ${s.row.id.padEnd(24)} ${s.ruleId}`,
			);
		}
	}

	console.log(
		"\nNo gate. Record these numbers in security.md S11, and decide per surface:\n" +
			"above 5%, tasks 16-18 land in report-only mode (emit, do not throw) — decision D-M.\n",
	);

	return true;
};
