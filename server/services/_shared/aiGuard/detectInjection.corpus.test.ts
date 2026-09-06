import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectInjection } from "./detectInjection";

type CorpusRow = { id: string; input: { text?: string } };

const load = (file: string): CorpusRow[] =>
	readFileSync(join(process.cwd(), "evals/datasets/aiGuard", file), "utf-8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as CorpusRow);

const CORPUS = [...load("adversarial.jsonl"), ...load("redteam.jsonl")].filter(
	(row) => typeof row.input.text === "string",
);

/**
 * AC-1: union scoring changes no English verdict and no English score. Rule
 * ids gained an `en:` prefix (universal ids are unprefixed), so the snapshot
 * from before the restructure is compared modulo that prefix.
 */
describe("detectInjection — English corpus baseline (AC-1)", () => {
	it("covers the whole corpus", () => {
		expect(CORPUS.length).toBeGreaterThanOrEqual(90);
	});

	it.each(
		CORPUS.map((row) => [row.id, row.input.text as string]),
	)("%s produces a stable verdict and score", (_id, text) => {
		const result = detectInjection(text);
		// `obfuscations` rides along deliberately: attribution is the part of the
		// guard with the least hand-written test surface, and snapshotting it buys
		// regression coverage across every row in both corpora for free.
		expect({
			verdict: result.verdict,
			score: result.score,
			obfuscations: result.obfuscations,
		}).toMatchSnapshot();
	});
});
