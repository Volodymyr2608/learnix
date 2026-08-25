import { describe, expect, it } from "vitest";
import { keyedByLabel } from "./keyedByLabel";

const name = (item: { name: string }) => item.name;

describe("keyedByLabel", () => {
	it("uses the label itself when every label is distinct", () => {
		const items = [{ name: "Closure" }, { name: "Hoisting" }];

		expect(keyedByLabel(items, name).map((k) => k.key)).toEqual([
			"Closure",
			"Hoisting",
		]);
	});

	it("gives duplicates distinct keys instead of dropping one", () => {
		const items = [{ name: "Closure" }, { name: "Closure" }, { name: "Scope" }];

		expect(keyedByLabel(items, name).map((k) => k.key)).toEqual([
			"Closure",
			"Closure#2",
			"Scope",
		]);
	});

	it("keeps every item, in order, whatever the labels", () => {
		const items = [{ name: "A" }, { name: "A" }, { name: "A" }];
		const keyed = keyedByLabel(items, name);

		expect(keyed).toHaveLength(3);
		expect(new Set(keyed.map((k) => k.key)).size).toBe(3);
		expect(keyed.map((k) => k.value)).toEqual(items);
	});

	it("handles an empty label without colliding on it", () => {
		const items = [{ name: "" }, { name: "" }];

		expect(keyedByLabel(items, name).map((k) => k.key)).toEqual(["", "#2"]);
	});

	it("returns an empty list for an empty input", () => {
		expect(keyedByLabel([], name)).toEqual([]);
	});
});
