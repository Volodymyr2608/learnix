/**
 * What a model call costs, in the unit a reader acts on.
 *
 * This table lives in `server/` rather than `evals/` because both read it and
 * two tables drift: the eval runner prices a suite run, `aiMetrics` prices a
 * production turn, and a price corrected in one place but not the other makes
 * the two answers disagree without either looking wrong. `evals/_shared/cost.ts`
 * imports from here and keeps only its run-aggregation on top.
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

/**
 * Pulls `usage_metadata` off a message, tolerating its absence.
 *
 * On a streamed call this is read from the aggregated end message, not from a
 * chunk: `@langchain/openai` sets `streamUsage: true` by default and therefore
 * already sends `stream_options: {include_usage: true}`, so usage arrives with
 * the final message rather than needing to be switched on.
 */
export const usageOfMessage = (message: unknown): TokenUsage => {
	const usage = (message as { usage_metadata?: unknown } | null | undefined)
		?.usage_metadata as
		| { input_tokens?: number; output_tokens?: number }
		| undefined;

	return {
		inputTokens: usage?.input_tokens ?? 0,
		outputTokens: usage?.output_tokens ?? 0,
	};
};
