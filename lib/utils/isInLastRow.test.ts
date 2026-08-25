import { describe, expect, it } from "vitest";
import { isInLastRow } from "./isInLastRow";

const lastRowOf = (count: number, columns: number) =>
	Array.from({ length: count }, (_, i) => i).filter((i) =>
		isInLastRow(i, count, columns),
	);

describe("isInLastRow", () => {
	it("puts both bottom items in the last row when the count is even", () => {
		// The case `:last-child` gets wrong: index 2 is on the bottom row beside
		// index 3, but only index 3 is the last child.
		expect(lastRowOf(4, 2)).toEqual([2, 3]);
	});

	it("puts only the trailing item in the last row when the count is odd", () => {
		expect(lastRowOf(5, 2)).toEqual([4]);
	});

	it("treats a single column as one item per row", () => {
		expect(lastRowOf(3, 1)).toEqual([2]);
	});

	it("puts every item in the last row when they all fit on one", () => {
		expect(lastRowOf(2, 2)).toEqual([0, 1]);
		expect(lastRowOf(1, 2)).toEqual([0]);
	});

	it("is false for an empty list or a nonsensical column count", () => {
		expect(isInLastRow(0, 0, 2)).toBe(false);
		expect(isInLastRow(0, 3, 0)).toBe(false);
	});
});
