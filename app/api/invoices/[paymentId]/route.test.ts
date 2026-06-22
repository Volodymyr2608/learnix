import { describe, expect, it } from "vitest";
import { GET } from "./route";

function makeParams(paymentId: string) {
	return { params: Promise.resolve({ paymentId }) };
}

describe("GET /api/invoices/[paymentId]", () => {
	it("returns 401 when token is missing", async () => {
		const req = new Request("http://localhost/api/invoices/pay-1");
		const res = await GET(req, makeParams("pay-1"));
		expect(res.status).toBe(401);
	});

	it("returns 401 when token is malformed", async () => {
		const req = new Request(
			"http://localhost/api/invoices/pay-1?token=garbage",
		);
		const res = await GET(req, makeParams("pay-1"));
		expect(res.status).toBe(401);
	});
});
