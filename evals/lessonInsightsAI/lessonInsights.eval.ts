import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { insightsChain } from "@/server/services/lessonInsightsAI/chains/parallel.chain";
import { accuracyGate } from "../_shared/score";
import { reportRunUsage, startRunUsage, usageRecorder } from "../_shared/usage";

type Row = {
	id: string;
	input: { content: string };
	expected: {
		summary_contains: string[];
		concepts_min: number;
		glossary_min: number;
	};
};

const DATASET = resolve(
	process.cwd(),
	"evals/datasets/lessonInsightsAI/lessonInsights.jsonl",
);

export async function runLessonInsightsEval(): Promise<boolean> {
	const recorder = usageRecorder();
	const startedAt = startRunUsage();
	const rows: Row[] = readFileSync(DATASET, "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));

	const results = await Promise.all(
		rows.map(async (r) => {
			const out = await insightsChain.invoke(
				{ content: r.input.content },
				recorder.config,
			);
			const summaryLower = out.summary.summary.toLowerCase();
			const summaryOk = r.expected.summary_contains.every((kw) =>
				summaryLower.includes(kw.toLowerCase()),
			);
			const conceptsOk =
				out.concepts.concepts.length >= r.expected.concepts_min;
			const glossaryOk =
				out.glossary.glossary.length >= r.expected.glossary_min;
			return { id: r.id, ok: summaryOk && conceptsOk && glossaryOk };
		}),
	);

	reportRunUsage(recorder, startedAt, results.length);

	return accuracyGate("lessonInsights", results, 0.9);
}
