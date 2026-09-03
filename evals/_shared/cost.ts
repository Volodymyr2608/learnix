/**
 * What a run costs, in the unit a reader acts on.
 *
 * "129 generator calls + 24 judge calls" was the honest figure available before
 * this, and it is the wrong unit: a judge call carries the rubric, so it is an
 * order of magnitude larger than a generator call and the two counts do not add
 * up to anything. Tokens are comparable; money is the number that decides
 * whether a suite runs on every prompt change or once a week.
 *
 * The price table and the `usage_metadata` reader moved to
 * `server/services/_shared/aiMetrics/pricing.ts` so that the eval runner and the
 * production metric read ONE table. What stays here is the part only a suite run
 * needs: accumulating usage across a run and formatting it for a terminal.
 */

import {
	type TokenUsage,
	totalUsage,
	usageCost,
	usageOfMessage,
} from "@/server/services/_shared/aiMetrics/pricing";

export { type TokenUsage, totalUsage, usageCost, usageOfMessage };

export type ModelRun = {
	model: string;
	usage: TokenUsage;
	calls: number;
};

const thousands = (n: number): string => `${(n / 1000).toFixed(1)}k`;

export const formatRunCost = (runs: readonly ModelRun[]): string => {
	const lines = runs.map((run) => {
		const cost = usageCost(run.usage, run.model);
		const money = cost === null ? "unpriced" : `$${cost.toFixed(3)}`;
		return (
			`  ${run.model.padEnd(14)} ${String(run.calls).padStart(4)} calls  ` +
			`${thousands(run.usage.inputTokens).padStart(7)} in  ` +
			`${thousands(run.usage.outputTokens).padStart(7)} out  ${money}`
		);
	});

	const priced = runs.map((run) => usageCost(run.usage, run.model));
	const total = priced.every((cost) => cost !== null)
		? `  ${"total".padEnd(14)} ${" ".repeat(30)}$${priced
				.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
				.toFixed(3)}`
		: `  total unknown — at least one model is unpriced`;

	return [...lines, total].join("\n");
};

/**
 * Usage recorded during a run, per model.
 *
 * A side channel for the same reason `reportRun` is one: the alternative is
 * threading a usage parameter through every call site of an eval that does not
 * care about cost.
 */
const recorded = new Map<string, { usage: TokenUsage; calls: number }>();

export const recordUsage = (model: string, usage: TokenUsage): void => {
	const existing = recorded.get(model);
	recorded.set(model, {
		calls: (existing?.calls ?? 0) + 1,
		usage: totalUsage([
			existing?.usage ?? { inputTokens: 0, outputTokens: 0 },
			usage,
		]),
	});
};

export const takeRecordedUsage = (): ModelRun[] => {
	const runs = [...recorded.entries()].map(([model, { usage, calls }]) => ({
		model,
		usage,
		calls,
	}));
	recorded.clear();
	return runs;
};
