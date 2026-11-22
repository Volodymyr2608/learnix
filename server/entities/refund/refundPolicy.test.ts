import { describe, expect, it } from "vitest";
import {
	LEGACY_REFUND_FAQ_ANSWER,
	REFUND_POLICY_POINTS,
	refundFaqAnswer,
} from "./refundPolicy";

describe("the refund policy text (FR-P21, AC-F19)", () => {
	const policy = REFUND_POLICY_POINTS.join(" ");

	it("states every term", () => {
		expect(policy).toContain("14 days");
		expect(policy).toMatch(/opened no more than 3 lessons/);
		expect(policy).toMatch(/half of the course's lessons/);
		expect(policy).toMatch(/certificate/);
		expect(policy).toMatch(/once per course/);
	});

	it("points to the Purchases page, not to contacting anyone", () => {
		expect(policy).toContain("Purchases page");
		expect(policy.toLowerCase()).not.toContain("contact us");
		expect(policy).not.toMatch(/30-day/i);
	});

	it("answers the FAQ with the old promise while the flag is off, the new one when it is on", () => {
		expect(refundFaqAnswer(false)).toBe(LEGACY_REFUND_FAQ_ANSWER);
		const answer = refundFaqAnswer(true);
		expect(answer).toContain("14 days");
		expect(answer).toContain("Purchases page");
		expect(answer.toLowerCase()).not.toContain("contact us");
	});
});
