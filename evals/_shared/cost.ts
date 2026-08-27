/**
 * What a run costs, in the unit a reader acts on.
 *
 * "129 generator calls + 24 judge calls" was the honest figure available before
 * this, and it is the wrong unit: a judge call carries the rubric, so it is an
 * order of magnitude larger than a generator call and the two counts do not add
 * up to anything. Tokens are comparable; money is the number that decides
 * whether a suite runs on every prompt change or once a week.
 *
 * Prices are USD per million tokens and go stale — they are a documented
 * constant here rather than a lookup, and an unknown model reports as unpriced
 * rather than free. A run that silently costs $0.00 is worse than one that
 * admits it does not know.
 */

export type TokenUsage = {
	inputTokens: number;
	outputTokens: number;
};

export type ModelRun = {
	model: string;
	usage: TokenUsage;
	calls: number;
};

/** USD per 1M tokens. Checked 2026-08-26; verify before quoting anywhere binding. */
const PRICES: Record<string, { input: number; output: number }> = {
	"gpt-4o-mini": { input: 0.15, output: 0.6 },
	"gpt-4o": { input: 2.5, output: 10 },
};

export const totalUsage = (usages: readonly TokenUsage[]): TokenUsage =>
	usages.reduce<TokenUsage>(
		(total, usage) => ({
			inputTokens: total.inputTokens + usage.inputTokens,
			outputTokens: total.outputTokens + usage.outputTokens,
		}),
		{ inputTokens: 0, outputTokens: 0 },
	);

/** USD, or null when the model has no recorded price. */
export const usageCost = (usage: TokenUsage, model: string): number | null => {
	const price = PRICES[model];
	if (!price) return null;

	return (
		(usage.inputTokens / 1_000_000) * price.input +
		(usage.outputTokens / 1_000_000) * price.output
	);
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

/** Pulls `usage_metadata` off a message, tolerating its absence. */
export const usageOfMessage = (message: unknown): TokenUsage => {
	const usage = (message as { usage_metadata?: unknown })?.usage_metadata as
		| { input_tokens?: number; output_tokens?: number }
		| undefined;

	return {
		inputTokens: usage?.input_tokens ?? 0,
		outputTokens: usage?.output_tokens ?? 0,
	};
};

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
