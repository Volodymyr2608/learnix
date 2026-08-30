import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Baselines: the previous run's numbers, in a file a diff can read.
 *
 * ADR-013 §7 asks for `pnpm eval` after a prompt change with the score posted
 * in the PR. That leaves the comparison in a human's memory and the numbers in
 * terminal scrollback, so "the same evaluation set after a change" — the brief's
 * A11 — cannot actually be checked by anyone later. A committed JSON file makes
 * the delta reviewable in the same place the prompt change is.
 *
 * Not a gate. Scores drift for reasons a threshold cannot judge, so this prints
 * what moved and leaves the call to the reader.
 *
 * A single-sample baseline carries run-to-run noise, and more of it than one
 * would guess: two consecutive tutor runs at temperature 0, same prompt hash,
 * disagreed by a category. Until an eval samples each row several times, treat
 * a one-row delta here as a draw rather than a regression.
 */

export type CategoryCount = {
	category: string;
	passed: number;
	total: number;
	/**
	 * Mean judge score per axis, when this category was judged.
	 *
	 * Recorded because an unrecorded number cannot be contradicted. The first
	 * version of ADR-031 asserted a judge figure that lived only in a terminal
	 * session, and it survived two commits before anyone could check it — it was
	 * wrong. A number in the baseline is a number a reviewer can argue with.
	 */
	judge?: {
		relevance: number;
		faithfulness: number;
		completeness: number;
		groundedness: number;
		judged: number;
	};
};

/**
 * Report-only measurements of what the model AUTHORED, as opposed to which
 * tools it reached for.
 *
 * Category pass rates cannot carry these: a category is pass/fail per attempt,
 * and each of these is a rate over the arguments of one tool call. They decide
 * three separate things, which is the bar for a number being worth recording —
 * `authoringValid` is the shipped validator's false-positive rate against the
 * shipped model, and a low figure means the feature denies real checks and the
 * student is simply never asked; `answerEchoed` decides whether suppression
 * alone suffices, since a suppressed check is one the student never sees; and
 * `keyFirst` decides how load-bearing the server-side shuffle is.
 *
 * No thresholds. A bar set before the first measurement is a guess.
 */
export type AuthoringMetrics = {
	/** `ask_concept_check` calls whose arguments were captured. */
	authored: number;
	/** Of those, how many `authorizeAskConceptCheck` would let through. */
	authoringValid: number;
	/** Of those, how many had their answer named in the reply that followed. */
	answerEchoed: number;
	/** Of those, how many put the correct option first before the shuffle. */
	keyFirst: number;
};

export type RunMetrics = {
	model: string;
	/** Identifies the prompt the numbers were produced under. */
	promptHash: string;
	/** Draws per row. One means the numbers carry a coin flip's worth of noise. */
	samples: number;
	/** The model that produced the judge scores, when a run was judged. */
	judgeModel?: string;
	categories: CategoryCount[];
	/** Present only for a surface where the model authors structured content. */
	authoring?: AuthoringMetrics;
};

export type Baseline = RunMetrics & { recordedAt: string };

export type BaselineReport = {
	changed: boolean;
	promptChanged: boolean;
	samplesChanged: boolean;
	judgeChanged: boolean;
	lines: string[];
};

/** Short, stable identifier for a prompt's exact text. */
export const promptHash = (prompt: string): string =>
	createHash("sha256").update(prompt).digest("hex").slice(0, 12);

export const baselinePath = (evalName: string): string =>
	resolve(process.cwd(), `evals/baselines/${evalName.replace(/:/g, "-")}.json`);

export const readBaseline = (evalName: string): Baseline | null => {
	const path = baselinePath(evalName);
	if (!existsSync(path)) return null;
	return JSON.parse(readFileSync(path, "utf-8")) as Baseline;
};

export const writeBaseline = (
	evalName: string,
	metrics: RunMetrics,
): string => {
	const path = baselinePath(evalName);
	mkdirSync(dirname(path), { recursive: true });
	const baseline: Baseline = {
		recordedAt: new Date().toISOString(),
		...metrics,
	};
	writeFileSync(path, `${JSON.stringify(baseline, null, "\t")}\n`);
	return path;
};

const rate = (count: CategoryCount): number =>
	count.total ? count.passed / count.total : 0;

const percent = (count: CategoryCount): string =>
	`${(rate(count) * 100).toFixed(1)}%`;

export const compareToBaseline = (
	before: Baseline,
	after: RunMetrics,
): BaselineReport => {
	const lines: string[] = [];
	const promptChanged = before.promptHash !== after.promptHash;

	if (promptChanged)
		lines.push(
			`prompt changed since the baseline (${before.promptHash} → ${after.promptHash}) — ` +
				"the two runs are different systems, not a regression",
		);

	// Baselines recorded before sampling existed carry no count; they were one
	// draw per row, which is what they should read as.
	const beforeSamples = before.samples ?? 1;
	const samplesChanged = beforeSamples !== after.samples;
	if (samplesChanged)
		lines.push(
			`samples per row changed (${beforeSamples} → ${after.samples}) — ` +
				"a mean over more draws is not the same measurement as a single one",
		);

	// Absent on both sides means neither run was judged — not a change.
	const judgeChanged =
		(before.judgeModel ?? null) !== (after.judgeModel ?? null);
	if (judgeChanged)
		lines.push(
			`judge changed (${before.judgeModel ?? "none"} → ${after.judgeModel ?? "none"}) — ` +
				"two judges are two instruments, so the scores are not a quality delta",
		);

	if (before.model !== after.model)
		lines.push(`model changed: ${before.model} → ${after.model}`);

	const categories = [
		...new Set([
			...before.categories.map((c) => c.category),
			...after.categories.map((c) => c.category),
		]),
	].sort();

	for (const category of categories) {
		const was = before.categories.find((c) => c.category === category);
		const now = after.categories.find((c) => c.category === category);

		if (!was && now) {
			lines.push(`  ${category.padEnd(20)} new  ${percent(now)}`);
			continue;
		}
		if (was && !now) {
			lines.push(`  ${category.padEnd(20)} gone (was ${percent(was)})`);
			continue;
		}
		if (!was || !now) continue;
		if (rate(was) === rate(now)) continue;

		const direction = rate(now) > rate(was) ? "up" : "down";
		lines.push(
			`  ${category.padEnd(20)} ${direction.padEnd(4)} ` +
				`${percent(was)} → ${percent(now)} (${now.passed}/${now.total})`,
		);
	}

	return {
		changed: lines.length > 0,
		promptChanged,
		samplesChanged,
		judgeChanged,
		lines,
	};
};

/**
 * Metrics an eval reports for the run that just happened.
 *
 * A side channel rather than a change to the `Promise<boolean>` contract that
 * all fourteen evals share: adopting baselines should not require touching the
 * thirteen evals that are not ready for them.
 */
const reported = new Map<string, RunMetrics>();

export const reportRun = (evalName: string, metrics: RunMetrics): void => {
	reported.set(evalName, metrics);
};

export const takeReportedRun = (evalName: string): RunMetrics | undefined => {
	const metrics = reported.get(evalName);
	reported.delete(evalName);
	return metrics;
};
