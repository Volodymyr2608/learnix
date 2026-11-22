import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Review I4: `/pricing` reads the student-refund flag. A prerendered page would freeze the value
 * at build time, so flipping the flag would leave the old promise here while the button is live.
 */
describe("/pricing reads the refund flag per request", () => {
	it("is rendered dynamically", () => {
		const source = readFileSync("app/(marketing)/pricing/page.tsx", "utf-8");
		expect(source).toContain("isStudentRefundEnabled()");
		expect(source).toMatch(/export const dynamic = "force-dynamic"/);
	});
});
