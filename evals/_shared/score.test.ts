import { afterEach, describe, expect, it, vi } from "vitest";
import {
	accuracyGate,
	type CategoryEvalResult,
	categoryGate,
	type EvalResult,
	flakyRows,
	formatRowOutcomes,
	formatScoreTable,
	precisionGate,
	retentionGate,
	rowStability,
	type SampleOutcome,
	type ScoredRow,
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

/**
 * A gate reports one number; this reports the twenty that produced it.
 *
 * The distinction the table exists to make is not "which rows failed" — the
 * gate already prints those — but WHERE the failures sit relative to the passes.
 * Four false positives below every true row mean the cut point is misplaced and
 * a prompt can move them; one false positive above a true row means the ranking
 * itself is broken, and no threshold separates what the model did not order.
 */
describe("formatScoreTable", () => {
	const scored = (id: string, score: number, expected: boolean): ScoredRow => ({
		id,
		score,
		expected,
	});

	it("orders rows by score, highest first", () => {
		const table = formatScoreTable(
			[
				scored("low", 0.4, false),
				scored("high", 0.95, true),
				scored("mid", 0.7, true),
			],
			0.8,
		);

		const ids = table
			.split("\n")
			.map((line) => line.match(/\b(low|mid|high)\b/)?.[1])
			.filter(Boolean);

		expect(ids).toEqual(["high", "mid", "low"]);
	});

	it("marks a high score on an incomplete row, and leaves a correct one unmarked", () => {
		const table = formatScoreTable(
			[scored("wrong", 0.9, false), scored("right", 0.9, true)],
			0.8,
		);

		const wrong =
			table.split("\n").find((line) => line.includes("wrong")) ?? "";
		const right =
			table.split("\n").find((line) => line.includes("right")) ?? "";

		expect(wrong).toMatch(/false positive/i);
		expect(right).not.toMatch(/false positive/i);
	});

	/**
	 * A row below the threshold cannot be a false positive whatever its label —
	 * it advanced nothing. Marking it would report the node's recall as if it
	 * were its precision.
	 */
	it("does not mark a low score on an incomplete row", () => {
		const table = formatScoreTable([scored("cautious", 0.3, false)], 0.8);

		expect(table).not.toMatch(/false positive/i);
	});

	it("renders a header and no rows for an empty run rather than throwing", () => {
		const table = formatScoreTable([], 0.8);

		expect(table).toMatch(/score/i);
		expect(table.split("\n").filter((line) => /\d/.test(line))).toEqual([]);
	});
});

/**
 * Precision alone is a gate a broken node can pass by giving up.
 *
 * The failure it cannot see is not the degenerate one — `accuracyGate` scores an
 * empty prediction set 0 and fails it. It is the partial collapse: a handful of
 * unmistakable rows kept above the line and everything else surrendered to a
 * manual Accept. That reads as perfect precision while the feature quietly stops
 * working, so the run holds a floor under how many complete rows survive.
 */
describe("retentionGate", () => {
	const scored = (id: string, score: number, expected: boolean): ScoredRow => ({
		id,
		score,
		expected,
	});

	/** Ten complete rows above the line, one below, and nine sparse rows. */
	const eleven = (retained: number): ScoredRow[] => [
		...Array.from({ length: retained }, (_, i) => scored(`ok${i}`, 0.9, true)),
		...Array.from({ length: 11 - retained }, (_, i) =>
			scored(`dropped${i}`, 0.4, true),
		),
		...Array.from({ length: 9 }, (_, i) => scored(`sparse${i}`, 0.3, false)),
	];

	it("passes when the floor is met exactly", () => {
		silence();

		expect(retentionGate("t", eleven(10), { threshold: 0.8, floor: 10 })).toBe(
			true,
		);
	});

	it("fails one row below the floor", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(retentionGate("t", eleven(9), { threshold: 0.8, floor: 10 })).toBe(
			false,
		);
	});

	/**
	 * The case the second gate exists for: three rich rows kept, eight complete
	 * ones abandoned, not a single false positive. Precision reads 100%.
	 */
	it("fails the collapse that precision reports as perfect", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		const collapsed = eleven(3);
		const highConf: EvalResult[] = collapsed
			.filter((r) => r.score >= 0.8)
			.map((r) => ({ id: r.id, ok: r.expected }));

		expect(accuracyGate("precision", highConf, 0.85)).toBe(true);
		expect(
			retentionGate("retention", collapsed, { threshold: 0.8, floor: 10 }),
		).toBe(false);
	});

	/**
	 * The mirror of the `accuracyGate([])` pin below. It behaves correctly today
	 * because 0 < floor, but a refactor to a rate — `retained / complete` — would
	 * introduce a 0/0 and nothing here would catch the vacuous pass.
	 */
	it("fails rather than passing vacuously when no row is complete", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(
			retentionGate("t", [scored("sparse", 0.3, false)], {
				threshold: 0.8,
				floor: 10,
			}),
		).toBe(false);
	});

	it("names the complete rows that dropped, so a red run is actionable", () => {
		const log = silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		retentionGate("t", eleven(9), { threshold: 0.8, floor: 10 });

		expect(log.mock.calls.flat().join(" ")).toContain("dropped0");
	});
});

/**
 * Pinned because the obvious refactor is wrong: `precisionGate` returns 1 for an
 * empty prediction set and would pass a node that advanced nothing at all.
 */
describe("accuracyGate on an empty set", () => {
	it("scores zero rather than one", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(accuracyGate("t", [], 0.85)).toBe(false);
	});
});

/**
 * The hole this closes was not hypothetical for long.
 *
 * `precisionGate` divided true positives by all positives and returned 1 when
 * there were none — "of the rows we advanced, all deserved it" is vacuously
 * true of a run that advanced nothing. `courseAI:assessCompletion` reported
 * "precision on ready=true: 100.0%" for months while making zero model calls:
 * the eval passed an empty user message, the node's first guard returned early
 * on exactly that, every prediction came back false, and the gate called it
 * perfect.
 *
 * An absent measurement is not a passing one. It is also not 0% precision —
 * which is why the run says what happened rather than printing a number that
 * invites the reader to interpret it.
 */
describe("precisionGate with nothing predicted", () => {
	const row = (id: string, predicted: boolean, expected: boolean) => ({
		id,
		predicted,
		expected,
	});

	it("fails when no row was predicted true", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(
			precisionGate("t", [row("a", false, true), row("b", false, false)], 0.9),
		).toBe(false);
	});

	it("says the run measured nothing rather than reporting a precision", () => {
		const log = silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		precisionGate("t", [row("a", false, true)], 0.9);

		expect(log.mock.calls.flat().join(" ")).toMatch(/nothing|no rows/i);
	});

	it("still scores a run that predicted something", () => {
		silence();

		expect(
			precisionGate("t", [row("a", true, true), row("b", false, true)], 0.9),
		).toBe(true);
	});

	/** An empty results array is the same absence, reached from further away. */
	it("fails on an empty result set", () => {
		silence();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(precisionGate("t", [], 0.9)).toBe(false);
	});
});

/**
 * A gate says how many rows were wrong. For a classifier that is not enough to
 * act on: the wrong intent, the right intent with the wrong resolved target, and
 * a `clarify` where the model declined to choose are three defects with three
 * repairs, and the failure list spells all of them `15, 19`.
 */
describe("formatRowOutcomes", () => {
	const sample = (
		id: string,
		ok: boolean,
		actual: string,
		expected = "revise:objectives",
	): SampleOutcome => ({ id, ok, expected, actual });

	it("names a row that failed every sample, and what the node returned instead", () => {
		const table = formatRowOutcomes([
			sample("15", false, "continue:null"),
			sample("15", false, "continue:null"),
			sample("15", false, "continue:null"),
		]);

		expect(table).toContain("15");
		expect(table).toContain("0/3");
		expect(table).toContain("revise:objectives");
		expect(table).toMatch(/continue:null\s+×3/);
	});

	/** The split between the two is the number a single draw cannot report. */
	it("lists every distinct return of a flaky row, with its count", () => {
		const table = formatRowOutcomes([
			sample("16", false, "continue:null"),
			sample("16", false, "continue:null"),
			sample("16", true, "revise:objectives"),
		]);

		expect(table).toContain("1/3");
		expect(table).toMatch(/continue:null\s+×2/);
		expect(table).toMatch(/revise:objectives\s+×1/);
	});

	it("leaves out a row that passed every sample", () => {
		const table = formatRowOutcomes([
			sample("02", true, "continue:null", "continue:null"),
			sample("15", false, "continue:null"),
		]);

		expect(table).not.toContain("02");
		expect(table).toContain("15");
	});

	/**
	 * An empty string, not a header over nothing: a heading with no rows under it
	 * reads as "the table failed to render", which is the opposite of the news.
	 */
	it("renders nothing at all when no row failed", () => {
		expect(
			formatRowOutcomes([sample("02", true, "continue:null", "continue:null")]),
		).toBe("");
	});
});
