import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	asWord,
	beforeAfterItems,
	coversWholeCorpus,
	datasetForEval,
	datasetRows,
	docFigures,
	drawsMoreThanOnce,
	forMatching,
	INDIRECT_DATASET_PATH,
	isStale,
	measuredOn,
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

/**
 * `TutorFigures` is everything the module could derive, so everything a claim
 * could assert came from one dataset and one baseline. The `aiGuard:indirect`
 * A/B is quoted in two documents and belongs to neither — which is why a
 * twelve-row denominator survived the corpus growing to sixteen with every
 * check in this file green.
 */
/**
 * The second half of the pair, and the one that reaches what pinning cannot.
 *
 * A measurement describes the system that existed when it ran. No test can
 * decide whether that system is still the current one — but it can refuse a
 * measurement that does not say when it ran, which leaves the reader able to
 * decide. Same shape as `reconciledOn` / `isStale`, one section down.
 */
describe("a measurement says when it was measured", () => {
	it("reads the marker off a single line", () => {
		expect(measuredOn("The wrap flips 1 in 12, measured 2026-08-09.")).toBe(
			"2026-08-09",
		);
	});

	it("reads the marker even when markdown wrapped it mid-sentence", () => {
		expect(
			measuredOn(
				"The wrap flips 1 in 12,\nmeasured\n2026-08-09, over twelve rows.",
			),
		).toBe("2026-08-09");
	});

	/**
	 * The first marker written against this reader opened its sentence, so the
	 * case-sensitive version read it as absent. Found by the check going red on
	 * a document that did say when.
	 */
	it("reads a marker that opens a sentence", () => {
		expect(measuredOn("Measured 2026-08-18, against the older tutor.")).toBe(
			"2026-08-18",
		);
	});

	it("returns null when nothing says when", () => {
		expect(measuredOn("The wrap flips 1 payload in 12.")).toBeNull();
	});

	/**
	 * Documents are full of dates. Only the one behind the marker is a claim
	 * about when the number was produced.
	 */
	it("does not mistake another date in the prose for the marker", () => {
		expect(
			measuredOn("Recorded 2026-09-02. The wrap flips 1 in 12."),
		).toBeNull();
	});
});

/**
 * A corpus that grew after the run is the quieter half of the same problem: the
 * figure is right, the denominator is right, and together they read as complete
 * coverage of a set four rows larger than anything the run touched.
 */
describe("a run that covered less than its corpus", () => {
	it("is complete when the corpus has not grown", () => {
		expect(coversWholeCorpus(12, 12)).toBe(true);
	});

	it("is partial when the corpus grew after the run", () => {
		expect(coversWholeCorpus(12, 16)).toBe(false);
	});

	/**
	 * A run covering more rows than the corpus holds means rows were deleted
	 * after it — the figure is equally unsafe to read as current, so it is not
	 * complete either.
	 */
	it("is not complete when the corpus shrank after the run", () => {
		expect(coversWholeCorpus(16, 12)).toBe(false);
	});
});

/**
 * §7 is where this repo keeps the before/after measurements it actually has,
 * and both of them describe a system that has since changed: the
 * `aiGuard:indirect` corpus grew from twelve rows to sixteen, and the
 * mastery-clause table measures a write tool ADR-033 deleted.
 *
 * Neither is wrong. Both are correct measurements of the system that existed
 * when they ran, and neither said so. Pinning cannot reach the second one at
 * all — its columns read "write refused", "write correctly granted", so there
 * is no figure to derive and no tool name to look up. A date is the smallest
 * thing that is both mechanically checkable and enough.
 */
describe("every before/after measurement in the strategy states when it ran", () => {
	const items = beforeAfterItems(readFileSync(STRATEGY_PATH, "utf-8"));

	/**
	 * A section that matched nothing must not pass as compliance. Two evals in
	 * this repo reported a perfect score while reaching no model at all, which
	 * is the same shape.
	 */
	it("finds the items §7 carries", () => {
		expect(items.length).toBeGreaterThanOrEqual(2);
	});

	it.each(items)("item $n — $title", ({ measured }) => {
		expect(measured).not.toBeNull();
	});

	it("reads an undated item as undated", () => {
		expect(
			beforeAfterItems(
				"## 7. Baselines\n\n**1. A thing** ✅ — it flips 1 in 12.\n\n## 8. Next",
			),
		).toEqual([{ n: 1, title: "A thing", measured: null }]);
	});

	it("reads a dated item as dated", () => {
		expect(
			beforeAfterItems(
				"## 7. Baselines\n\n**1. A thing** ✅ — measured 2026-08-09.\n\n## 8. Next",
			),
		).toEqual([{ n: 1, title: "A thing", measured: "2026-08-09" }]);
	});

	/** §3 also numbers things. Only §7 carries before/after measurements. */
	it("does not read items out of another section", () => {
		expect(
			beforeAfterItems("## 3. The map\n\n**1. Not this** ✅ — no date here.\n"),
		).toEqual([]);
	});
});

describe("a claim can read a corpus other than the tutor set", () => {
	const figures = docFigures();

	it("counts the indirect corpus rather than trusting the sentence", () => {
		expect(figures.indirectRows).toBe(datasetRows(INDIRECT_DATASET_PATH));
	});

	it("finds rows there at all", () => {
		expect(figures.indirectRows).toBeGreaterThan(0);
	});

	/**
	 * Widening is additive. Every claim written against the tutor figures must
	 * resolve to exactly what it resolved to before, or this task changed
	 * something it had no business changing.
	 */
	it("leaves every existing claim resolving what it did before", () => {
		expect(pinnedClaims(figures).map((claim) => claim.expected)).toEqual(
			pinnedClaims({
				...tutorFigures(),
				indirectRows: figures.indirectRows,
			}).map((claim) => claim.expected),
		);
	});
});

describe("claims that restate a machine figure carry the machine's number", () => {
	const claims = pinnedClaims(docFigures());

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

	/**
	 * The tutor figures had this case from the start; the indirect corpus is a
	 * second source and needs its own, or a claim could quote a constant that
	 * happens to still be written down.
	 */
	it("catches an indirect corpus that drifted", () => {
		const drifted = pinnedClaims({ ...docFigures(), indirectRows: 999 });
		const current = pinnedClaims(docFigures());

		expect(drifted.map((claim) => claim.expected)).not.toEqual(
			current.map((claim) => claim.expected),
		);
	});

	it("catches a figure that drifted", () => {
		const drifted = pinnedClaims({ ...docFigures(), rows: 999 });
		const current = pinnedClaims(docFigures());

		expect(drifted.map((claim) => claim.expected)).not.toEqual(
			current.map((claim) => claim.expected),
		);
	});
});

describe("numbers written as words", () => {
	it("spells the counts the prose uses", () => {
		expect(asWord(8)).toBe("eight");
		expect(asWord(9)).toBe("nine");
		expect(asWord(13)).toBe("thirteen");
	});

	it("leaves a number it cannot spell as digits", () => {
		expect(asWord(156)).toBe("156");
	});
});

describe("which evals draw more than one sample", () => {
	/**
	 * Found by breaking the check on purpose, which is what that step is for:
	 * dropping `classifyIntent` back to `SAMPLES = 1` left this file green. The
	 * detector matched the constant's PRESENCE, so an eval drawing each row once
	 * counted as sampled — a check that could not fail for the case it is named
	 * after, which is the class of defect this whole reopening is about.
	 */
	it("does not count an eval that declares one draw", () => {
		expect(drawsMoreThanOnce("const SAMPLES = 3;")).toBe(true);
		expect(drawsMoreThanOnce("const SAMPLES = 1;")).toBe(false);
		expect(drawsMoreThanOnce("const ROWS = 20;")).toBe(false);
	});

	/** `redteam` names its own `ALLOW_ROW_SAMPLES`, so a `\b` anchor would lie. */
	it("counts a sample constant whose name carries a prefix", () => {
		expect(drawsMoreThanOnce("const ALLOW_ROW_SAMPLES = 5;")).toBe(true);
	});

	/** Declaration order must not decide it. */
	it("reads every declared count, not the first one", () => {
		expect(drawsMoreThanOnce("const A_SAMPLES = 1;\nconst SAMPLES = 3;")).toBe(
			true,
		);
	});

	it("ignores a constant that only appears in a comment", () => {
		expect(drawsMoreThanOnce("// const SAMPLES = 3;\nconst x = 1;")).toBe(
			false,
		);
	});

	it("finds the sampled evals by the constant they declare", () => {
		expect(sampledEvals()).toEqual([
			"evals/aiGuard/redteam.eval.ts",
			"evals/aiOutput/falsePositive.eval.ts",
			"evals/aiOutput/leakRecall.eval.ts",
			"evals/courseAI/classifyIntent.eval.ts",
			"evals/lessonAI/tutor.eval.ts",
		]);
	});

	it("registers every eval `pnpm eval` can run", () => {
		expect(registeredEvals()).toContain("lessonAI:tutor");
		expect(registeredEvals().length).toBeGreaterThan(sampledEvals().length);
	});
});
