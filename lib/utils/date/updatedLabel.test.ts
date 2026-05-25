import { describe, expect, it } from "vitest";
import updatedLabel from "./updatedLabel";

describe("updatedLabel", () => {
	it("prefixes a relative distance with 'Updated' and a suffix", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
		const label = updatedLabel(tenMinutesAgo);
		expect(label).toMatch(/^Updated /);
		expect(label).toContain("ago");
	});
});
