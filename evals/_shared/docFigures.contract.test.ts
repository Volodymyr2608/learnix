import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	asWord,
	datasetForEval,
	datasetRows,
	forMatching,
	isStale,
	PINNED_CLAIMS,
	pinnedClaims,
	RECONCILED_DOCS,
	reconciledOn,
	registeredEvals,
	STRATEGY_PATH,
	sampledEvals,
	strategyMapCells,
	tutorFigures,
} from "./docFigures";

/**
 * Prose that quotes a machine figure goes stale silently. It happened three
 * times in two weeks: the tutor dataset grew from 43 to 49 to 52 rows and five
 * documents kept quoting the number they were written with, a prompt change
 * flipped `missing-info` from 0/9 to 9/9 while the rubric still explained why
 * it was red, and a tool was renamed while the strategy still named the old
 * one. Every one of those was found by a human re-reading the file, which is
 * exactly the check that does not scale.
 *
 * Two mechanisms, because prose needs both:
 *
 * - **Structural figures are pinned.** Row counts, category counts, attempts
 *   and the §3 map are derivable exactly, so the document must carry the
 *   derived number and nothing else.
 * - **Narrative figures are dated.** No test can decide whether "the judge
 *   rewards thoroughness" still describes a baseline. What a test *can* do is
 *   refuse a document that claims a reconciliation older than the baseline it
 *   quotes — so re-recording the baseline turns every dependent document red
 *   until a human re-reads it.
 *
 * The second is the one that matters. The first only catches the figures I
 * already know to look for.
 */

describe("the figures come from the dataset and the baseline", () => {
	const figures = tutorFigures();

	it("counts the dataset rows rather than trusting a constant", () => {
		expect(figures.rows).toBe(
			datasetRows("evals/datasets/lessonAI/tutor.jsonl"),
		);
	});

	it("derives attempts from rows and the baseline's own sample count", () => {
		expect(figures.attempts).toBe(figures.rows * figures.samples);
	});

	it("splits the categories into the gated ones and the measured rest", () => {
		expect(figures.gated.length + figures.measured).toBe(figures.categories);
		expect(figures.gated.length).toBeGreaterThan(0);
	});

	it("reads the day the baseline was recorded", () => {
		expect(figures.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("every document that quotes the baseline says when it was reconciled", () => {
	const { recordedAt } = tutorFigures();

	it("lists documents to check", () => {
		expect(RECONCILED_DOCS.length).toBeGreaterThan(0);
	});

	it.each(RECONCILED_DOCS)("%s exists", (file) => {
		expect(existsSync(file)).toBe(true);
	});

	it.each(RECONCILED_DOCS)("%s carries a reconciliation date", (file) => {
		expect(reconciledOn(readFileSync(file, "utf-8"))).not.toBeNull();
	});

	/**
	 * The failure this is here for: someone re-records the baseline, the numbers
	 * in five documents become last week's, and nothing goes red.
	 */
	it.each(
		RECONCILED_DOCS,
	)("%s was reconciled no earlier than the baseline was recorded", (file) => {
		const on = reconciledOn(readFileSync(file, "utf-8"));

		expect(isStale(on, recordedAt)).toBe(false);
	});
});

describe("the staleness rule", () => {
	it("accepts a reconciliation on the day the baseline was recorded", () => {
		expect(isStale("2026-08-30", "2026-08-30")).toBe(false);
	});

	it("accepts a reconciliation after the baseline was recorded", () => {
		expect(isStale("2026-08-31", "2026-08-30")).toBe(false);
	});

	it("rejects a reconciliation from before the baseline was recorded", () => {
		expect(isStale("2026-08-27", "2026-08-30")).toBe(true);
	});

	it("rejects a document with no reconciliation date at all", () => {
		expect(isStale(null, "2026-08-30")).toBe(true);
	});

	it("does not mistake another date in the prose for the marker", () => {
		expect(
			reconciledOn("Written 2026-08-11. Revised 2026-08-27. Status: live."),
		).toBeNull();
	});

	it("reads the marker even when markdown wrapped it mid-sentence", () => {
		expect(
			reconciledOn(
				"- **Figures:** last reconciled with\n  `evals/baselines/lessonAI-tutor.json` on 2026-08-31.",
			),
		).toBe("2026-08-31");
	});

	it("reads the date out of the sentence the documents actually carry", () => {
		expect(
			reconciledOn(
				"the figures here were last reconciled with " +
					"`evals/baselines/lessonAI-tutor.json` on 2026-08-31.",
			),
		).toBe("2026-08-31");
	});
});

describe("the eval map in ai-eval-strategy.md matches the datasets it describes", () => {
	const cells = strategyMapCells(readFileSync(STRATEGY_PATH, "utf-8"));

	it("finds a row per registered eval that has a dataset file", () => {
		const described = new Set(cells.map((cell) => cell.evalId));

		for (const evalId of registeredEvals()) {
			const dataset = datasetForEval(evalId);
			if (dataset === null) continue;
			expect(described).toContain(evalId);
		}
	});

	it.each(cells)("$evalId states its dataset's row count", ({
		evalId,
		rows,
	}) => {
		const dataset = datasetForEval(evalId);
		if (dataset === null) return;

		expect(rows).toBe(datasetRows(dataset));
	});
});

describe("claims that restate a machine figure carry the machine's number", () => {
	const claims = pinnedClaims(tutorFigures());

	it("has a claim to check", () => {
		expect(claims.length).toBeGreaterThan(0);
	});

	/**
	 * A claim that no longer matches is not a pass. Someone reworded the
	 * sentence, and the figure inside it needs re-pinning rather than trusting.
	 */
	it.each(claims)("$file — $what", ({ file, pattern, expected }) => {
		const found = pattern.exec(forMatching(readFileSync(file, "utf-8")));

		expect(found, `no sentence in ${file} matches ${pattern}`).not.toBeNull();
		expect(found?.slice(1, expected.length + 1)).toEqual(expected);
	});
});

/**
 * Markdown wraps prose at the column, so the sentence a claim pins is routinely
 * split across two lines. A matcher that reads the file as written would fail
 * on a reflow — which trains everyone to loosen the pattern instead of fixing
 * the figure.
 */
describe("matching prose the way markdown stores it", () => {
	it("joins a sentence wrapped across lines", () => {
		expect(
			/is (\d+) rows across (\d+) categories/
				.exec(forMatching("The dataset\nis 52 rows across 15 categories."))
				?.slice(1),
		).toEqual(["52", "15"]);
	});

	it("keeps a table row on its own line", () => {
		const table = "| a | 1 |\n| b | 2 |";

		expect(forMatching(table)).toBe(table);
	});

	it("does not join across a paragraph break", () => {
		expect(forMatching("one\n\ntwo")).toBe("one\n\ntwo");
	});
});

describe("the claim registry stays honest", () => {
	it.each(PINNED_CLAIMS)("$file exists", ({ file }) => {
		expect(existsSync(file)).toBe(true);
	});

	it("catches a figure that drifted", () => {
		const drifted = pinnedClaims({ ...tutorFigures(), rows: 999 });
		const current = pinnedClaims(tutorFigures());

		expect(drifted.map((claim) => claim.expected)).not.toEqual(
			current.map((claim) => claim.expected),
		);
	});
});

describe("numbers written as words", () => {
	it("spells the counts the prose uses", () => {
		expect(asWord(9)).toBe("nine");
		expect(asWord(13)).toBe("thirteen");
	});

	it("leaves a number it cannot spell as digits", () => {
		expect(asWord(156)).toBe("156");
	});
});

describe("which evals draw more than one sample", () => {
	it("finds the sampled evals by the constant they declare", () => {
		expect(sampledEvals()).toEqual([
			"evals/aiGuard/redteam.eval.ts",
			"evals/aiOutput/falsePositive.eval.ts",
			"evals/aiOutput/leakRecall.eval.ts",
			"evals/lessonAI/tutor.eval.ts",
		]);
	});

	it("registers every eval `pnpm eval` can run", () => {
		expect(registeredEvals()).toContain("lessonAI:tutor");
		expect(registeredEvals().length).toBeGreaterThan(sampledEvals().length);
	});
});
