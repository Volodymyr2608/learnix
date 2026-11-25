import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Review I4: `/pricing` reads the student-refund flag. A prerendered page would freeze the value
 * at build time, so flipping the flag would leave the old promise here while the button is live.
 */
describe.each([
	"app/(marketing)/pricing/page.tsx",
	"app/(marketing)/refund-policy/page.tsx",
])("%s reads the refund flag per request", (page) => {
	it("is rendered dynamically", () => {
		const source = readFileSync(page, "utf-8");
		expect(source).toContain("isStudentRefundEnabled()");
		expect(source).toMatch(/export const dynamic = "force-dynamic"/);
	});
});

describe("/refund-policy with the flag off (FR-P21, C24)", () => {
	it("is a 404, not today's promise", () => {
		const source = readFileSync(
			"app/(marketing)/refund-policy/page.tsx",
			"utf-8",
		);
		expect(source).toMatch(/if \(!isStudentRefundEnabled\(\)\) notFound\(\)/);
	});
});
