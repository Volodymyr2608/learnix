import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (value: string | undefined) => {
	vi.resetModules();
	vi.stubEnv("REFUND_STUDENT_ENABLED", value);
	const { isStudentRefundEnabled } = await import("./refundFlag");
	return isStudentRefundEnabled();
};

describe("isStudentRefundEnabled (FR-P20, C24)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("is off when unset", async () => {
		expect(await load(undefined)).toBe(false);
	});

	it('is on only for the exact string "true"', async () => {
		expect(await load("true")).toBe(true);
	});

	it('is off for "1"', async () => {
		expect(await load("1")).toBe(false);
	});
});
