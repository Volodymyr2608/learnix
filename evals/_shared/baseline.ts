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
};

export type RunMetrics = {
	model: string;
	/** Identifies the prompt the numbers were produced under. */
	promptHash: string;
	categories: CategoryCount[];
};

export type Baseline = RunMetrics & { recordedAt: string };

export type BaselineReport = {
	changed: boolean;
	promptChanged: boolean;
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
