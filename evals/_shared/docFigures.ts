import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GATED_THRESHOLDS } from "../lessonAI/tutorDataset";
import { stripComments } from "./promptFidelity";

/**
 * The figures a document is allowed to quote, read from the files that produce
 * them. Prose drifts from its machine source within days — measured three
 * times on this surface alone — so the numbers in `ai-eval-strategy.md`,
 * `ai-eval-rubric.md`, ADR-031 and the two feature specs are checked against
 * the dataset and the committed baseline rather than against the author's
 * memory of them.
 *
 * This module is the reader. `docFigures.contract.test.ts` is the claim.
 */

export const TUTOR_DATASET_PATH = "evals/datasets/lessonAI/tutor.jsonl";
export const TUTOR_BASELINE_PATH = "evals/baselines/lessonAI-tutor.json";
export const STRATEGY_PATH = "docs/specs/ai-eval-strategy.md";
export const RUNNER_PATH = "evals/runEvals.ts";
/**
 * The `aiGuard:indirect` corpus. It is quoted in two documents as the
 * denominator of the wrap A/B and belongs to no baseline of its own, so the
 * only honest source for its size is the file.
 */
export const INDIRECT_DATASET_PATH = "evals/datasets/aiGuard/indirect.jsonl";
export const EVALS_DIR = "evals";

/** One category's deterministic result, as the committed baseline records it. */
export type CategoryResult = {
	category: string;
	passed: number;
	total: number;
};

export type TutorFigures = {
	/** Rows in the golden set. */
	rows: number;
	/** Distinct categories across those rows. */
	categories: number;
	/** Draws per row on the run that produced the baseline. */
	samples: number;
	/** `rows × samples` — what the eval calls an attempt. */
	attempts: number;
	/** Categories carrying a threshold, from `GATED_THRESHOLDS`. */
	gated: readonly string[];
	/** The rest: reported without a bar. */
	measured: number;
	/** The day the baseline was recorded, `YYYY-MM-DD`. */
	recordedAt: string;
	results: readonly CategoryResult[];
	/** Evals `pnpm eval` can run. */
	totalEvals: number;
	/** Of those, the ones that draw a row exactly once. */
	singleSampleEvals: number;
};

/** Rows in a `.jsonl` set, ignoring a missing trailing newline. */
export const datasetRows = (file: string): number =>
	readFileSync(file, "utf-8")
		.split("\n")
		.filter((line) => line.trim().length > 0).length;

const walkEvals = (dir: string): string[] =>
	readdirSync(dir)
		.flatMap((entry) => {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) return walkEvals(full);
			return full.endsWith(".eval.ts") ? [full] : [];
		})
		.sort();

/** Every eval id registered in the runner, in declaration order. */
export const registeredEvals = (): string[] =>
	Array.from(
		readFileSync(RUNNER_PATH, "utf-8").matchAll(/^\t"([\w]+:[\w]+)":/gm),
	).flatMap((match) => (match[1] ? [match[1]] : []));

/**
 * Does this source draw each row more than once?
 *
 * The VALUE, not the presence of the constant. Matching `SAMPLES\s*=\s*\d+`
 * counted `SAMPLES = 1` as sampling, so the one thing this predicate is named
 * after — an eval that draws a row once — was the one thing it could not
 * detect. Found by dropping a sampled eval back to 1 on purpose and watching
 * this file stay green.
 */
export const drawsMoreThanOnce = (source: string): boolean => {
	// Every match, not the first. Two things break a single `exec` here: a file
	// may declare more than one sample constant, and the name is not always bare —
	// `redteam` calls its own `ALLOW_ROW_SAMPLES`, which a `\b` anchor would
	// exclude while excluding nothing that deserves it. The question is whether
	// ANY row is drawn more than once, so the largest declared count answers it
	// and the declaration order stops mattering.
	const counts = [
		...stripComments(source).matchAll(/SAMPLES\s*=\s*(\d+)/g),
	].map((match) => Number(match[1]));
	return counts.some((count) => count > 1);
};

/**
 * Evals that draw a row more than once. Detected by the constant rather than
 * by a list, so an eval that starts sampling stops being counted as
 * single-sample without anyone remembering to edit this file.
 */
export const sampledEvals = (): string[] =>
	walkEvals(EVALS_DIR).filter((file) =>
		drawsMoreThanOnce(readFileSync(file, "utf-8")),
	);

/**
 * The dataset an eval reads, by the `<surface>/<name>` convention its id
 * already encodes. `null` where an eval carries its payloads in the file
 * itself, which `aiOutput:leak` does.
 */
export const datasetForEval = (evalId: string): string | null => {
	const [surface, name] = evalId.split(":");
	if (!surface || !name) return null;

	const path = `evals/datasets/${surface}/${name}.jsonl`;
	return existsSync(path) ? path : null;
};

const categoriesIn = (file: string): Set<string> =>
	new Set(
		Array.from(
			readFileSync(file, "utf-8").matchAll(/"category":\s*"([^"]+)"/g),
		).flatMap((match) => (match[1] ? [match[1]] : [])),
	);

export const tutorFigures = (): TutorFigures => {
	const baseline = JSON.parse(readFileSync(TUTOR_BASELINE_PATH, "utf-8"));
	const rows = datasetRows(TUTOR_DATASET_PATH);
	const gated = Object.keys(GATED_THRESHOLDS);
	const categories = categoriesIn(TUTOR_DATASET_PATH).size;

	return {
		rows,
		categories,
		samples: baseline.samples,
		attempts: rows * baseline.samples,
		gated,
		measured: categories - gated.length,
		recordedAt: String(baseline.recordedAt).slice(0, 10),
		results: baseline.categories.map(
			({ category, passed, total }: CategoryResult) => ({
				category,
				passed,
				total,
			}),
		),
		totalEvals: registeredEvals().length,
		singleSampleEvals: registeredEvals().length - sampledEvals().length,
	};
};

/** `passed/total` for one category, as the prose spells it. */
/**
 * Everything a pinned claim may quote: the tutor figures, plus the figures that
 * come from somewhere else entirely.
 *
 * The split matters. `TutorFigures` is derived from one dataset and one
 * baseline, and for as long as that was the whole input, a claim could only be
 * written about numbers those two files produced. A sentence quoting any other
 * corpus was unpinnable — not rejected, simply invisible — and the
 * `aiGuard:indirect` denominator sat at twelve for the three weeks after the
 * corpus grew to sixteen without a single check going red.
 */
export type DocFigures = TutorFigures & {
	/** Rows in the `aiGuard:indirect` corpus, read at call time. */
	indirectRows: number;
};

export const docFigures = (): DocFigures => ({
	...tutorFigures(),
	indirectRows: datasetRows(INDIRECT_DATASET_PATH),
});

export const passRate = (
	figures: TutorFigures,
	category: string,
): [string, string] => {
	const found = figures.results.find((r) => r.category === category);
	if (!found) throw new Error(`no category ${category} in the baseline`);
	return [String(found.passed), String(found.total)];
};

const WORDS = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
	"twenty",
];

/**
 * Small counts read as words in this repo's prose. A figure too large to spell
 * comes back as digits, which is how the documents write those anyway.
 */
export const asWord = (n: number): string => WORDS[n] ?? String(n);

const capitalized = (word: string): string =>
	word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A document as a claim should read it: prose paragraphs unwrapped to one line,
 * tables left alone. Markdown reflows a sentence whenever a word is added
 * before it, and a pattern that breaks on a reflow gets loosened rather than
 * re-pinned — which is the failure this whole file exists to prevent.
 */
export const forMatching = (doc: string): string =>
	doc
		.split(/\n{2,}/)
		.map((block) =>
			block.trimStart().startsWith("|")
				? block
				: block.replace(/\n[ \t]*/g, " "),
		)
		.join("\n\n");

/**
 * The sentence every document quoting the tutor baseline carries. It reads as
 * prose and parses as a date, which is the only way a claim about *narrative*
 * figures can be checked at all.
 */
const RECONCILED =
	/reconciled with `evals\/baselines\/lessonAI-tutor\.json` on (\d{4}-\d{2}-\d{2})/;

export const reconciledOn = (doc: string): string | null =>
	RECONCILED.exec(forMatching(doc))?.[1] ?? null;

/**
 * A document is stale when it claims a reconciliation older than the baseline
 * it quotes — or claims none at all. Re-recording the baseline is what turns
 * these red, which is the point: the numbers changed, so someone has to read
 * the prose again.
 */
export const isStale = (
	reconciled: string | null,
	recordedAt: string,
): boolean => reconciled === null || reconciled < recordedAt;

/** Documents whose figures come from the tutor baseline. */
export const RECONCILED_DOCS: readonly string[] = [
	STRATEGY_PATH,
	"docs/specs/ai-eval-rubric.md",
	"docs/adr/031-eval-fidelity-and-baselines.md",
	"docs/specs/features/ai-evaluation-harness/spec.md",
	"docs/specs/features/ai-tutor-guardrails/security.md",
];

export type StrategyMapCell = { evalId: string; rows: number | null };

/**
 * The §3 map — one row per eval, with the size of the set it runs. Scoped to
 * that section so the before/after tables further down, which also name evals,
 * are not read as claims about dataset size.
 */
export const strategyMapCells = (doc: string): StrategyMapCell[] => {
	const section = doc.split(/^## /m).find((s) => s.startsWith("3. "));
	if (!section) return [];

	return Array.from(
		section.matchAll(/^\|\s*`([\w]+:[\w]+)`\s*\|([^\n]*)$/gm),
	).flatMap(([, evalId, rest]) => {
		if (!evalId) return [];

		const cell = (rest ?? "").split("|")[1] ?? "";
		const leading = /\d+/.exec(cell);
		return [{ evalId, rows: leading ? Number(leading[0]) : null }];
	});
};

export type PinnedClaim = {
	/** Repo-relative path of the document. */
	file: string;
	/** What the sentence asserts, for the failure message. */
	what: string;
	/** Must match once; its groups are the figures. */
	pattern: RegExp;
	/** The machine's value for each group, in order. */
	expected: (figures: DocFigures) => string[];
};

/**
 * Sentences that restate a figure this module can derive. Each entry pins a
 * location, never a value — the value comes from the dataset or the baseline,
 * so a claim cannot be satisfied by a stale number that happens to still be
 * written down.
 *
 * A reworded sentence stops matching and fails. That is the intended
 * behaviour: rewording is exactly when a figure gets left behind.
 */
export const PINNED_CLAIMS: readonly PinnedClaim[] = [
	{
		file: "docs/specs/features/ai-evaluation-harness/spec.md",
		what: "what `pnpm eval lessonAI:tutor` runs today",
		pattern:
			/`lessonAI:tutor` \((\d+) rows × (\d+) samples, (\d+) categories\)/,
		expected: (f) => [String(f.rows), String(f.samples), String(f.categories)],
	},
	{
		file: STRATEGY_PATH,
		what: "the §3 map's category split for the tutor",
		pattern:
			/`lessonAI:tutor`[^\n]*?\|\s*\d+, (\d+) categories[^\n]*?; (\d+) other categories \*\*measured only\*\*/,
		expected: (f) => [String(f.categories), String(f.measured)],
	},
	{
		file: STRATEGY_PATH,
		what: "the same split, restated in §1",
		pattern: /(\w+) of the tutor's (\w+) categories/,
		expected: (f) => [asWord(f.measured), asWord(f.categories)],
	},
	{
		file: STRATEGY_PATH,
		what: "how many evals the strategy covers",
		pattern: /— (\d+) evals under `evals\//,
		expected: (f) => [String(f.totalEvals)],
	},
	{
		file: STRATEGY_PATH,
		what: "how far the small golden sets sit below the tutor's",
		pattern: /far below the tutor's (\d+)/,
		expected: (f) => [String(f.rows)],
	},
	{
		file: STRATEGY_PATH,
		what: "how many evals draw a row once (§3 note)",
		pattern: /(\w+) of the other (\w+) are single-sample, pooled/,
		expected: (f) => [asWord(f.singleSampleEvals), asWord(f.totalEvals - 1)],
	},
	{
		file: STRATEGY_PATH,
		what: "how many evals draw a row once (§9 known limit)",
		pattern: /\*\*(\w+) of (\w+) evals are single-sample and pooled\.\*\*/,
		expected: (f) => [
			capitalized(asWord(f.singleSampleEvals)),
			asWord(f.totalEvals),
		],
	},
	{
		file: "docs/specs/features/ai-tutor-guardrails/security.md",
		what: "the size of the golden set behind S13",
		pattern: /The dataset is (\d+) rows across (\d+) categories/,
		expected: (f) => [String(f.rows), String(f.categories)],
	},
	{
		file: "docs/specs/ai-eval-rubric.md",
		what: "the deterministic result the judge disagrees with",
		pattern:
			/`low-confidence` satisfies every deterministic assertion \((\d+)\/(\d+)\)/,
		expected: (f) => passRate(f, "low-confidence"),
	},
	{
		file: "docs/specs/ai-eval-rubric.md",
		what: "what `missing-info` does now the prompt asks for the missing detail",
		pattern: /`missing-info` now passes every assertion \((\d+)\/(\d+)\)/,
		expected: (f) => passRate(f, "missing-info"),
	},
	{
		file: "docs/adr/031-eval-fidelity-and-baselines.md",
		what: "the deterministic result behind the judge's value",
		pattern:
			/`low-confidence` satisfies every\s+assertion in the suite — (\d+)\/(\d+) samples/,
		expected: (f) => passRate(f, "low-confidence"),
	},
];

export const pinnedClaims = (
	figures: DocFigures,
): (Omit<PinnedClaim, "expected"> & { expected: string[] })[] =>
	PINNED_CLAIMS.map((claim) => ({
		file: claim.file,
		what: claim.what,
		pattern: claim.pattern,
		expected: claim.expected(figures),
	}));
