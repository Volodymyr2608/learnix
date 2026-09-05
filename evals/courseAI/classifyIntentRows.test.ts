import { describe, expect, it } from "vitest";
import {
	categoryOf,
	loadClassifyIntentRows,
	type Row,
} from "./classifyIntentRows";

/**
 * Three of the twenty rows never reach the model: `classify_intent` returns
 * `continue` on its own first line when there is no history or no message. That
 * is real production behaviour and worth a row, but scoring it beside the rows
 * the model actually classified hands the gate fifteen points nothing asked the
 * model about — the `assessCompletion` defect (P2) in a milder form.
 *
 * The category is derived from the row rather than stored in the JSONL on
 * purpose. A stored field would be a second copy of what `history: []` already
 * says, and the two would disagree the first time either moved.
 */

const row = (over: Partial<Row> = {}): Row => ({
	id: "x",
	currentStep: "objectives",
	history: [{ role: "user", content: "something", step: "basic" }],
	userMessage: "and something else",
	expected: { intent: "continue", reviseTarget: null },
	...over,
});

describe("categoryOf", () => {
	it("calls a row with history and a message classified", () => {
		expect(categoryOf(row())).toBe("classified");
	});

	it("calls a row with no history early-return", () => {
		expect(categoryOf(row({ history: [] }))).toBe("early-return");
	});

	/**
	 * The node's condition is `history.length === 0 || !userMessage`, so this
	 * half has to be mirrored too — an auto-triggered turn carries history and
	 * still short-circuits.
	 */
	it("calls a row with history but no message early-return", () => {
		expect(categoryOf(row({ userMessage: "" }))).toBe("early-return");
	});
});

describe("the shipped dataset", () => {
	const rows = loadClassifyIntentRows();

	it("splits three early-return rows from seventeen classified", () => {
		const byCategory = rows.map(categoryOf);

		expect(byCategory.filter((c) => c === "early-return")).toHaveLength(3);
		expect(byCategory.filter((c) => c === "classified")).toHaveLength(17);
	});

	it("puts rows 01, 09 and 20 on the early-return side", () => {
		const early = rows
			.filter((r) => categoryOf(r) === "early-return")
			.map((r) => r.id)
			.sort();

		expect(early).toEqual(["01", "09", "20"]);
	});
});
