import { describe, expect, it } from "vitest";
import generateListWithIds from "./generateListWithIds";

describe("generateListWithIds", () => {
	it("creates a list of the requested length with sequential ids", () => {
		expect(generateListWithIds(3)).toEqual([{ id: 0 }, { id: 1 }, { id: 2 }]);
	});
	it("returns an empty array for count 0", () => {
		expect(generateListWithIds(0)).toEqual([]);
	});
});
