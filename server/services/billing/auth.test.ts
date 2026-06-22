import { describe, expect, it } from "vitest";
import { signInvoiceToken, verifyInvoiceToken } from "./auth";

describe("invoice token", () => {
	it("round-trips a paymentId", async () => {
		const token = await signInvoiceToken("pay-123");
		const payload = await verifyInvoiceToken(token);
		expect(payload.paymentId).toBe("pay-123");
	});

	it("rejects a tampered token", async () => {
		const token = await signInvoiceToken("pay-123");
		const tampered = `${token.slice(0, -2)}xy`;
		await expect(verifyInvoiceToken(tampered)).rejects.toThrow();
	});
});
