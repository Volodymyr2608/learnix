import { describe, expect, it } from "vitest";
import { formatRunCost, type TokenUsage, totalUsage, usageCost } from "./cost";

/**
 * "How much does a run cost" was answerable only as a call count, which is the
 * wrong unit: the judge's calls are an order of magnitude larger than the
 * generator's, so 24 judge calls and 129 generator calls are not comparable
 * quantities. Tokens are, and money is the one a reader acts on.
 */

const usage = (input: number, output: number): TokenUsage => ({
	inputTokens: input,
	outputTokens: output,
});

describe("totalUsage", () => {
	it("sums input and output across calls", () => {
		expect(totalUsage([usage(100, 20), usage(50, 10)])).toEqual({
			inputTokens: 150,
			outputTokens: 30,
		});
	});

	it("is zero for no calls rather than undefined", () => {
		expect(totalUsage([])).toEqual({ inputTokens: 0, outputTokens: 0 });
	});
});

describe("usageCost", () => {
	/** Output tokens cost several times input; a flat rate understates a chatty run. */
	it("prices input and output at different rates", () => {
		const cheap = usageCost(usage(1_000_000, 0), "gpt-4o-mini");
		const dear = usageCost(usage(0, 1_000_000), "gpt-4o-mini");

		expect(cheap).not.toBeNull();
		expect(dear).not.toBeNull();
		expect(dear ?? 0).toBeGreaterThan(cheap ?? 0);
	});

	it("prices the judge above the generator for identical usage", () => {
		const same = usage(1_000_000, 100_000);

		expect(usageCost(same, "gpt-4o") ?? 0).toBeGreaterThan(
			usageCost(same, "gpt-4o-mini") ?? 0,
		);
	});

	/**
	 * An unknown model must not silently price at zero — a run would report as
	 * free, which is worse than reporting nothing.
	 */
	it("returns null for a model it has no price for", () => {
		expect(usageCost(usage(1000, 100), "some-future-model")).toBeNull();
	});
});

describe("formatRunCost", () => {
	it("names tokens and money per model", () => {
		const line = formatRunCost([
			{ model: "gpt-4o-mini", usage: usage(500_000, 50_000), calls: 129 },
			{ model: "gpt-4o", usage: usage(200_000, 5_000), calls: 24 },
		]);

		expect(line).toContain("gpt-4o-mini");
		expect(line).toContain("129");
		expect(line).toContain("$");
	});

	it("says so rather than inventing a total when a price is unknown", () => {
		const line = formatRunCost([
			{ model: "mystery-model", usage: usage(1000, 100), calls: 3 },
		]);

		expect(line).toMatch(/unpriced|unknown/i);
		expect(line).not.toContain("$0.00");
	});
});
