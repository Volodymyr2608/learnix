import { describe, expect, it } from "vitest";
import { REFUND_WINDOW_MS } from "@/server/services/refund/refundRules";
import {
	APPEAL_GRACE_MS,
	appealDeadline,
	CHECKOUT_MAX_MS,
	RELEASE_GRACE_MS,
	releaseEligibleAt,
} from "./payoutRules";

const PAID_AT = new Date("2026-11-01T10:00:00.000Z");
const CREATED_AT = new Date("2026-11-01T09:50:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SECOND = 1000;

describe("releaseEligibleAt (FR-P2a, C5)", () => {
	it("is the window end plus the 1 h grace margin", () => {
		expect(RELEASE_GRACE_MS).toBe(HOUR);
		expect(releaseEligibleAt(PAID_AT, CREATED_AT).getTime()).toBe(
			PAID_AT.getTime() + REFUND_WINDOW_MS + HOUR,
		);
	});

	it("is not reached at 14 d + 1 h − 1 s, and reached at 14 d + 1 h", () => {
		const eligibleAt = releaseEligibleAt(PAID_AT, CREATED_AT).getTime();
		const at = (ms: number) => PAID_AT.getTime() + ms;
		expect(at(14 * DAY + HOUR - SECOND) < eligibleAt).toBe(true);
		expect(at(14 * DAY + HOUR) >= eligibleAt).toBe(true);
	});

	it("bounds an unknown paidAt by checkout creation + 24 h (H1)", () => {
		expect(CHECKOUT_MAX_MS).toBe(DAY);
		expect(releaseEligibleAt(null, CREATED_AT).getTime()).toBe(
			CREATED_AT.getTime() + DAY + REFUND_WINDOW_MS + HOUR,
		);
	});
});

describe("appealDeadline (FR-S16, H3)", () => {
	const windowEndsAt = new Date(PAID_AT.getTime() + REFUND_WINDOW_MS);

	it("is the window end after an early denial", () => {
		const deniedAt = new Date(PAID_AT.getTime() + 2 * DAY);
		expect(appealDeadline(windowEndsAt, deniedAt)).toEqual(windowEndsAt);
	});

	it("is the denial + 3 days after a late denial", () => {
		expect(APPEAL_GRACE_MS).toBe(3 * DAY);
		const deniedAt = new Date(PAID_AT.getTime() + 13 * DAY);
		expect(appealDeadline(windowEndsAt, deniedAt).getTime()).toBe(
			deniedAt.getTime() + 3 * DAY,
		);
	});
});
