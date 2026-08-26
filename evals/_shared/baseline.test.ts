import { describe, expect, it } from "vitest";
import { type Baseline, compareToBaseline, type RunMetrics } from "./baseline";

/**
 * "Run the same set after a prompt change" only means something if the previous
 * numbers survived somewhere a diff can reach. This is the comparison half —
 * pure, so it can be tested without spending a model call.
 */

const metrics = (
	categories: Record<string, [number, number]>,
	promptHash = "abc123",
	samples = 3,
): RunMetrics => ({
	model: "gpt-4o-mini",
	promptHash,
	samples,
	categories: Object.entries(categories).map(([category, [passed, total]]) => ({
		category,
		passed,
		total,
	})),
});

const baseline = (
	categories: Record<string, [number, number]>,
	promptHash = "abc123",
	samples = 3,
): Baseline => ({
	recordedAt: "2026-08-26T00:00:00.000Z",
	...metrics(categories, promptHash, samples),
});

describe("compareToBaseline", () => {
	it("reports no movement when every category is unchanged", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }),
			metrics({ valid: [8, 8] }),
		);

		expect(report.changed).toBe(false);
		expect(report.promptChanged).toBe(false);
	});

	it("names a category that regressed, with both numbers", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }),
			metrics({ valid: [6, 8] }),
		);

		expect(report.changed).toBe(true);
		expect(report.lines.join("\n")).toContain("valid");
		expect(report.lines.join("\n")).toMatch(/100\.0%.*75\.0%/);
	});

	it("names an improvement too, not only a regression", () => {
		const report = compareToBaseline(
			baseline({ "tool-abuse": [1, 3] }),
			metrics({ "tool-abuse": [3, 3] }),
		);

		expect(report.changed).toBe(true);
		expect(report.lines.join("\n")).toContain("tool-abuse");
	});

	/**
	 * The reason the hash is stored at all: comparing a run against a baseline
	 * taken under a different prompt reads as a regression when it is simply a
	 * different system. ADR-013 §7 asks for a run after a prompt change; this is
	 * what makes forgetting visible.
	 */
	it("flags a baseline recorded under a different prompt", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }, "old-hash"),
			metrics({ valid: [8, 8] }, "new-hash"),
		);

		expect(report.promptChanged).toBe(true);
		expect(report.lines.join("\n")).toMatch(/prompt/i);
	});

	it("reports a category the baseline has never seen as new", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }),
			metrics({ valid: [8, 8], "low-confidence": [2, 2] }),
		);

		expect(report.changed).toBe(true);
		expect(report.lines.join("\n")).toContain("low-confidence");
		expect(report.lines.join("\n")).toMatch(/new/i);
	});

	it("reports a category that disappeared from the run", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8], bait: [4, 4] }),
			metrics({ valid: [8, 8] }),
		);

		expect(report.changed).toBe(true);
		expect(report.lines.join("\n")).toContain("bait");
	});
});

/**
 * A baseline taken with one draw per row is not comparable to a run that
 * averages three. Reading that difference as a regression is exactly the
 * mistake the sample count exists to prevent.
 */
describe("compareToBaseline across sample counts", () => {
	it("flags a baseline recorded with a different number of samples", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }, "abc123", 1),
			metrics({ valid: [8, 8] }, "abc123", 3),
		);

		expect(report.samplesChanged).toBe(true);
		expect(report.lines.join("\n")).toMatch(/sample/i);
	});

	it("does not flag matching sample counts", () => {
		const report = compareToBaseline(
			baseline({ valid: [8, 8] }, "abc123", 3),
			metrics({ valid: [8, 8] }, "abc123", 3),
		);

		expect(report.samplesChanged).toBe(false);
	});
});

/**
 * Baselines recorded before sampling existed have no `samples` field. They were
 * one draw per row, so that is what they should read as — not `undefined`,
 * which prints as a value nobody chose.
 */
describe("legacy baselines", () => {
	it("reads a baseline with no sample count as a single sample", () => {
		const legacy = baseline({ valid: [8, 8] });
		delete (legacy as { samples?: number }).samples;

		const report = compareToBaseline(legacy, metrics({ valid: [8, 8] }));

		expect(report.samplesChanged).toBe(true);
		expect(report.lines.join("\n")).toContain("1 → 3");
		expect(report.lines.join("\n")).not.toContain("undefined");
	});
});
