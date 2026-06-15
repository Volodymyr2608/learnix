import { describe, expect, it } from "vitest";
import { deriveConnectStatus } from "./connectStatus";

const base = {
	details_submitted: false,
	payouts_enabled: false,
	requirements: {
		currently_due: [],
		past_due: [],
		disabled_reason: null,
	},
};

describe("deriveConnectStatus", () => {
	it("not_started", () =>
		expect(deriveConnectStatus(null)).toBe("not_started"));
	it("restricted", () =>
		expect(
			deriveConnectStatus({
				...base,
				requirements: {
					...base.requirements,
					disabled_reason: "rejected.fraud",
				},
			}),
		).toBe("restricted"));
	it("action_required (due)", () =>
		expect(
			deriveConnectStatus({
				...base,
				details_submitted: true,
				requirements: {
					...base.requirements,
					currently_due: ["external_account"],
				},
			}),
		).toBe("action_required"));
	it("action_required (not submitted)", () =>
		expect(deriveConnectStatus(base)).toBe("action_required"));
	it("pending_review", () =>
		expect(
			deriveConnectStatus({
				...base,
				details_submitted: true,
			}),
		).toBe("pending_review"));
	it("verified", () =>
		expect(
			deriveConnectStatus({
				...base,
				details_submitted: true,
				payouts_enabled: true,
			}),
		).toBe("verified"));
});
