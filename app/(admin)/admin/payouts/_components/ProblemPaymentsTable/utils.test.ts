import { describe, expect, it } from "vitest";
import { ageLabel, problemRows } from "./utils";

const NOW = new Date("2026-11-20T10:00:00.000Z");

describe("ProblemPaymentsTable utils", () => {
	it("formats an age in days or hours", () => {
		expect(ageLabel(new Date("2026-11-17T10:00:00.000Z"), NOW)).toBe("3 d");
		expect(ageLabel(new Date("2026-11-20T07:00:00.000Z"), NOW)).toBe("3 h");
		expect(ageLabel(null, NOW)).toBe("—");
	});

	it("flattens the three problem lists into rows with their retry kind", () => {
		const rows = problemRows(
			{
				overdueRefunds: [
					{
						requestId: "req_1",
						paymentId: "pay_1",
						amountCents: 4999,
						approvedAt: NOW,
						error: "declined",
					},
				],
				stuckTransfers: [{ paymentId: "pay_2", amountCents: 4000, since: NOW }],
				pendingReversals: [
					{ paymentId: "pay_3", amountCents: 4000, refundedAt: NOW },
				],
			},
			NOW,
		);
		expect(rows.map((r) => [r.kind, r.targetId])).toEqual([
			["refund", "req_1"],
			["release", "pay_2"],
			["reversal", "pay_3"],
		]);
		expect(rows[0]?.detail).toBe("declined");
	});
});
