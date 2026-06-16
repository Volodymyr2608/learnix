import { describe, expect, it } from "vitest";
import relativeTimeLabel from "./relativeTime";

describe("relativeTimeLabel", () => {
	it("renders a past distance with an 'ago' suffix", () => {
		const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
		expect(relativeTimeLabel(tenMinutesAgo)).toContain("ago");
	});
});