import { describe, expect, it } from "vitest";
import { truncateLabel } from "./utils";

describe("truncateLabel", () => {
	it("returns short strings unchanged", () => {
		expect(truncateLabel("React Basics", 14)).toBe("React Basics");
	});

	it("returns a string exactly at the limit unchanged", () => {
		expect(truncateLabel("Fourteen chars", 14)).toBe("Fourteen chars");
	});

	it("truncates longer strings with a trailing ellipsis at the limit", () => {
		const out = truncateLabel("Advanced TypeScript Patterns", 14);
		expect(out).toBe("Advanced Type…");
		expect(out).toHaveLength(14);
	});
});
