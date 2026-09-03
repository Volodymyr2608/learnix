import { describe, expect, it } from "vitest";
import {
	type TokenUsage,
	totalUsage,
	usageCost,
	usageOfMessage,
} from "./pricing";

/**
 * The price table moved here from `evals/_shared/cost.ts` so that the eval
 * runner and the server read one table rather than two that drift (spec AC 1).
 * `evals/_shared/cost.test.ts` is the regression proof that the move changed no
 * behaviour; these cases pin the two properties the server newly depends on.
 */

const usage = (input: number, output: number): TokenUsage => ({
	inputTokens: input,
	outputTokens: output,
});

describe("usageCost (AC 2)", () => {
	it("prices a known model from the table", () => {
		// gpt-4o-mini: $0.15 / 1M in, $0.60 / 1M out.
		expect(usageCost(usage(1_000_000, 1_000_000), "gpt-4o-mini")).toBeCloseTo(
			0.75,
			6,
		);
	});

	it("returns null, never 0, for a model absent from the table", () => {
		// A run that silently costs $0.00 is worse than one that admits it does
		// not know: zero is a number a reader will sum, null is one they cannot.
		const cost = usageCost(usage(1_000, 1_000), "some-unreleased-model");

		expect(cost).toBeNull();
		expect(cost).not.toBe(0);
	});
});

describe("usageOfMessage", () => {
	it("reads usage_metadata off a message", () => {
		const message = {
			usage_metadata: { input_tokens: 12, output_tokens: 34 },
		};

		expect(usageOfMessage(message)).toEqual(usage(12, 34));
	});

	it("yields zeros rather than throwing when usage_metadata is absent", () => {
		// A provider that stops returning usage degrades to zeroes, not to a
		// crash in the middle of a student's turn.
		expect(usageOfMessage({})).toEqual(usage(0, 0));
		expect(usageOfMessage(undefined)).toEqual(usage(0, 0));
		expect(usageOfMessage(null)).toEqual(usage(0, 0));
	});
});

describe("totalUsage", () => {
	it("sums usages", () => {
		expect(totalUsage([usage(1, 2), usage(10, 20)])).toEqual(usage(11, 22));
	});
});
