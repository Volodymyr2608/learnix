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

const UNKNOWN_MODEL = "unknown";

/**
 * The model id, dug out of the invocation params a callback carries.
 *
 * Read defensively: this is provider-shaped data, and a shape change must
 * degrade the model label rather than throw inside a student's turn.
 *
 * It lives here rather than in `handler.ts` for the reason the table above
 * does: the eval recorder needs the same reader, and this module imports
 * nothing — reaching into `handler.ts` for six pure lines would drag `emit` →
 * `logger` → Sentry into a unit-test process that never emits anything.
 */
export const modelOf = (extraParams?: Record<string, unknown>): string => {
	const params = extraParams?.invocation_params as
		| { model?: unknown; model_name?: unknown }
		| undefined;
	const model = params?.model ?? params?.model_name;
	return typeof model === "string" ? model : UNKNOWN_MODEL;
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
	// Own-property only: PRICES is a plain object literal, so PRICES["__proto__"]
	// and PRICES["constructor"] are truthy and would slip past a falsy guard —
	// yielding NaN, a number-typed non-number that sums the whole turn to NaN.
	const price = Object.hasOwn(PRICES, model) ? PRICES[model] : undefined;
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
/**
 * Provider data is not trusted to be numeric.
 *
 * The "every emitted value is a primitive scalar" contract (AC 6) is asserted
 * against the TYPE, which is a compile-time claim over runtime data this code
 * does not own: a provider or a proxy at a non-default base URL returning a
 * string or an object here would put it straight onto the log line with no test
 * failing. Anything that is not a finite, non-negative number counts as zero.
 */
const tokenCount = (value: unknown): number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export const usageOfMessage = (message: unknown): TokenUsage => {
	const usage = (message as { usage_metadata?: unknown } | null | undefined)
		?.usage_metadata as
		| { input_tokens?: unknown; output_tokens?: unknown }
		| undefined;

	return {
		inputTokens: tokenCount(usage?.input_tokens),
		outputTokens: tokenCount(usage?.output_tokens),
	};
};
