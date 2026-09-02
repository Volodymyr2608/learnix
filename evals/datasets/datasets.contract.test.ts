import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Floors that apply to every golden set, whatever surface it belongs to.
 *
 * A two-row dataset cannot produce a meaningful score: every result is 0%, 50%
 * or 100%, so a threshold is decoration and a regression is indistinguishable
 * from a coin landing badly. Three of these sets sat at two rows for months
 * without anything saying so, which is the argument for checking it here rather
 * than remembering it per surface.
 */

const DATASETS_DIR = "evals/datasets";

/** The smallest set on which a percentage says anything at all. */
const MIN_ROWS = 5;

const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) return walk(full);
		return full.endsWith(".jsonl") ? [full] : [];
	});

const rowsOf = (file: string): unknown[] =>
	readFileSync(file, "utf-8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line, i) => {
			try {
				return JSON.parse(line);
			} catch (cause) {
				throw new Error(`${file} line ${i + 1} is not valid JSON`, { cause });
			}
		});

const files = walk(DATASETS_DIR);

describe("every eval dataset", () => {
	it("finds dataset files to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files)("%s parses as JSONL", (file) => {
		expect(() => rowsOf(file)).not.toThrow();
	});

	it.each(files)("%s holds enough rows to score", (file) => {
		expect(rowsOf(file).length).toBeGreaterThanOrEqual(MIN_ROWS);
	});

	/**
	 * Ids are what a failure report can name. A set without them reports
	 * `row-3`, which says nothing once the file is edited.
	 */
	it.each(files)("%s gives every row a unique id", (file) => {
		const ids = rowsOf(file)
			.map((row) => (row as { id?: unknown }).id)
			.filter((id): id is string => typeof id === "string");

		expect(ids).toHaveLength(rowsOf(file).length);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

/**
 * A baseline whose category totals no longer match the dataset it was recorded
 * against.
 *
 * `compareToBaseline` reports a category by its RATE, so a category that grew
 * from four rows to six while both runs scored 100% produces 12/12 against
 * 18/18 and prints nothing at all. The set got half as big again and the diff
 * stayed silent — which happened on the branch that added this test. Nothing
 * else notices: `docFigures` pins `rows × samples` in prose and the total row
 * count, never the per-category totals a comparison is actually made of.
 *
 * Derivable from two files already in the repo, so it costs a run of nothing.
 */
// `evals/datasets/<surface>/<name>.jsonl` is recorded as `<surface>-<name>.json`,
// which is `baselinePath`'s `evalName.replace(/:/g, "-")` seen from the other
// end — the eval is registered as `<surface>:<name>`.
const baselineFor = (dataset: string): string =>
	join(
		"evals/baselines",
		`${basename(dirname(dataset))}-${basename(dataset, ".jsonl")}.json`,
	);

type Baseline = {
	samples: number;
	categories: { category: string; total: number }[];
};

const withBaselines = files.filter((file) => existsSync(baselineFor(file)));

describe("every committed baseline", () => {
	it("finds baselines to check", () => {
		expect(withBaselines.length).toBeGreaterThan(0);
	});

	it.each(
		withBaselines,
	)("%s has a baseline whose category totals match the rows it was recorded against", (file) => {
		const baseline = JSON.parse(
			readFileSync(baselineFor(file), "utf-8"),
		) as Baseline;

		const rowsPerCategory = new Map<string, number>();
		for (const row of rowsOf(file)) {
			const category = (row as { category?: unknown }).category;
			if (typeof category !== "string") continue;
			rowsPerCategory.set(category, (rowsPerCategory.get(category) ?? 0) + 1);
		}

		const expected = Object.fromEntries(
			[...rowsPerCategory].map(([category, rows]) => [
				category,
				rows * baseline.samples,
			]),
		);
		const recorded = Object.fromEntries(
			baseline.categories.map((c) => [c.category, c.total]),
		);

		expect(recorded).toEqual(expected);
	});
});
