import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type CategoryEvalResult,
	categoryGate,
	flakyRows,
	rowStability,
} from "./score";

/**
 * The gate has to hold two ideas at once: some categories are a regression when
 * they drop, and some are a measurement nobody has set a bar for yet. Collapsing
 * them into one number is what hides which class is failing.
 */

const row = (
	category: string,
	ok: boolean,
	id = `${category}-${ok}`,
): CategoryEvalResult => ({ id, category, ok });

const silence = () => vi.spyOn(console, "log").mockImplementation(() => {});

afterEach(() => vi.restoreAllMocks());

describe("categoryGate", () => {
	it("passes when every gated category clears its threshold", () => {
		silence();

		expect(
			categoryGate("t", [row("valid", true), row("valid", true, "v2")], {
				valid: 0.8,
			}),
		).toBe(true);
	});

	it("fails when a gated category falls below its threshold", () => {
		silence();
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(
			categoryGate("t", [row("valid", true), row("valid", false, "v2")], {
				valid: 0.8,
			}),
		).toBe(false);
		expect(error).toHaveBeenCalled();
	});

	/** The measurement half: a category with no threshold can never go red. */
	it("never fails on a category with no threshold, even at zero", () => {
		silence();

		expect(
			categoryGate(
				"t",
				[row("valid", true), row("bait", false), row("bait", false, "b2")],
				{ valid: 0.8 },
			),
		).toBe(true);
	});

	it("gates each category separately rather than on the pooled average", () => {
		silence();

		// Pooled: 3/4 = 75%, which clears 0.7. Per category: off-topic is 0/1.
		expect(
			categoryGate(
				"t",
				[
					row("valid", true),
					row("valid", true, "v2"),
					row("valid", true, "v3"),
					row("off-topic", false),
				],
				{ valid: 0.7, "off-topic": 0.7 },
			),
		).toBe(false);
	});

	it("reports every category, gated or not", () => {
		const log = silence();

		categoryGate("t", [row("valid", true), row("bait", false)], {
			valid: 0.8,
		});

		const printed = log.mock.calls.flat().join("\n");
		expect(printed).toContain("valid");
		expect(printed).toContain("bait");
	});

	it("passes when nothing is gated at all", () => {
		silence();

		expect(categoryGate("t", [row("bait", false)], {})).toBe(true);
	});

	it("survives an empty result set", () => {
		silence();

		expect(categoryGate("t", [], { valid: 0.8 })).toBe(true);
	});
});

/**
 * Sampling is what separates "this eval failed" from "this eval fails about a
 * third of the time". A row that passes 2 of 3 runs is not a pass and not a
 * failure — it is the actual behaviour of the system, and the single-sample
 * runs that preceded this were reporting one draw as if it were the value.
 */
describe("rowStability", () => {
	it("counts passes per row across samples", () => {
		const stability = rowStability([
			row("valid", true, "a"),
			row("valid", false, "a"),
			row("valid", true, "a"),
		]);

		expect(stability).toEqual([
			{ id: "a", category: "valid", passed: 2, samples: 3 },
		]);
	});

	it("keeps rows separate", () => {
		const stability = rowStability([
			row("valid", true, "a"),
			row("valid", true, "a"),
			row("bait", false, "b"),
			row("bait", false, "b"),
		]);

		expect(stability).toHaveLength(2);
		expect(stability.find((s) => s.id === "a")?.passed).toBe(2);
		expect(stability.find((s) => s.id === "b")?.passed).toBe(0);
	});
});

describe("flakyRows", () => {
	it("finds rows that neither always pass nor always fail", () => {
		const flaky = flakyRows(
			rowStability([
				row("valid", true, "always"),
				row("valid", true, "always"),
				row("valid", false, "never"),
				row("valid", false, "never"),
				row("valid", true, "sometimes"),
				row("valid", false, "sometimes"),
			]),
		);

		expect(flaky.map((f) => f.id)).toEqual(["sometimes"]);
	});

	it("finds nothing when every row is stable", () => {
		expect(
			flakyRows(
				rowStability([row("valid", true, "a"), row("valid", true, "a")]),
			),
		).toEqual([]);
	});

	/** With one sample per row nothing can look flaky — the blind spot itself. */
	it("cannot detect flakiness from a single sample", () => {
		expect(flakyRows(rowStability([row("valid", true, "a")]))).toEqual([]);
	});
});
