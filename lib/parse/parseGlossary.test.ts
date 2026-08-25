import { describe, expect, it } from "vitest";
import { parseGlossary } from "./parseGlossary";

describe("parseGlossary", () => {
	it("keeps every well-formed entry, in order", () => {
		expect(
			parseGlossary([
				{ term: "Closure", definition: "A function bundled with its scope." },
				{ term: "Hoisting", definition: "Declarations move to the top." },
			]),
		).toEqual([
			{ term: "Closure", definition: "A function bundled with its scope." },
			{ term: "Hoisting", definition: "Declarations move to the top." },
		]);
	});

	it("drops only the malformed entries, never the whole list", () => {
		expect(
			parseGlossary([
				{ term: "Closure", definition: "A function bundled with its scope." },
				{ term: "Hoisting" },
				{ definition: "no term" },
				"not an object",
				null,
			]),
		).toEqual([
			{ term: "Closure", definition: "A function bundled with its scope." },
		]);
	});

	it("returns an empty list for anything that is not an array", () => {
		expect(parseGlossary(null)).toEqual([]);
		expect(parseGlossary(undefined)).toEqual([]);
		expect(parseGlossary("[]")).toEqual([]);
		expect(parseGlossary({ term: "Closure", definition: "x" })).toEqual([]);
	});

	it("never throws on a hostile value", () => {
		expect(() => parseGlossary(Number.NaN)).not.toThrow();
		expect(() => parseGlossary([[], {}, 0])).not.toThrow();
	});
});
