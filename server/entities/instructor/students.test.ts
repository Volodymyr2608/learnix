import { describe, expect, it } from "vitest";
import { getStudentsInput } from "./students";

describe("getStudentsInput", () => {
	it("applies defaults for sort and page", () => {
		const parsed = getStudentsInput.parse({});
		expect(parsed).toMatchObject({ status: "all", sort: "recent", page: 1 });
	});

	it("rejects an unknown sort value", () => {
		expect(() => getStudentsInput.parse({ sort: "bogus" })).toThrow();
	});

	it("trims the search query and rejects page < 1", () => {
		expect(getStudentsInput.parse({ q: "  ann  " }).q).toBe("ann");
		expect(() => getStudentsInput.parse({ page: 0 })).toThrow();
	});
});
