import { describe, expect, it } from "vitest";
import { REFUND_CONDITIONS } from "@/server/entities/refund/refund.dto";
import {
	APPEAL_AFTER_DENIAL_MS,
	appealDeadline,
	appealReminderDue,
	isAutoApprovable,
} from "./appealRules";
import { REFUND_WINDOW_MS } from "./refundRules";

const DAY = 24 * 60 * 60 * 1000;
const PAID_AT = new Date("2026-11-01T22:30:00.000Z");
const at = (ms: number) => new Date(PAID_AT.getTime() + ms);
const WINDOW_END = at(REFUND_WINDOW_MS);

describe("appealDeadline (FR-S16, AC-F6)", () => {
	it("is the window end for a direct appeal", () => {
		expect(
			appealDeadline({ kind: "direct", paidAt: PAID_AT, deniedAt: null }),
		).toEqual(WINDOW_END);
	});

	it("is the window end after an early denial", () => {
		expect(
			appealDeadline({
				kind: "after_denial",
				paidAt: PAID_AT,
				deniedAt: at(2 * DAY),
			}),
		).toEqual(WINDOW_END);
	});

	it("is denial + 3 days when that is later than the window end", () => {
		const deniedAt = at(13 * DAY);
		expect(
			appealDeadline({ kind: "after_denial", paidAt: PAID_AT, deniedAt }),
		).toEqual(new Date(deniedAt.getTime() + APPEAL_AFTER_DENIAL_MS));
	});

	it("is null with an unknown payment time and no denial (fail closed)", () => {
		expect(
			appealDeadline({ kind: "direct", paidAt: null, deniedAt: null }),
		).toBeNull();
	});
});

describe("isAutoApprovable (FR-A5, AC-C11)", () => {
	const appeal = (overrides = {}) => ({
		status: "open" as const,
		kind: "after_denial" as const,
		exceededCondition: "window",
		paidAt: PAID_AT,
		...overrides,
	});

	it("approves an open after-denial appeal for another condition once day 14 has passed", () => {
		expect(isAutoApprovable(appeal(), WINDOW_END)).toBe(true);
		expect(isAutoApprovable(appeal(), at(REFUND_WINDOW_MS - 1))).toBe(false);
	});

	it.each(
		REFUND_CONDITIONS.map((c) => [
			c,
			c !== "threshold" && c !== "account_limit",
		]),
	)("for an exceeded %s: %s", (condition, expected) => {
		expect(
			isAutoApprovable(appeal({ exceededCondition: condition }), WINDOW_END),
		).toBe(expected);
	});

	it("never approves a direct appeal, a decided one, or one with no payment time", () => {
		expect(isAutoApprovable(appeal({ kind: "direct" }), at(30 * DAY))).toBe(
			false,
		);
		expect(isAutoApprovable(appeal({ status: "denied" }), at(30 * DAY))).toBe(
			false,
		);
		expect(isAutoApprovable(appeal({ paidAt: null }), at(30 * DAY))).toBe(
			false,
		);
	});
});

describe("appealReminderDue (FR-A4)", () => {
	it.each([
		[9, false],
		[10, true],
		[11, false],
		[12, false],
		[13, true],
		[14, true],
		[20, true],
	])("payment-day %i: %s", (day, expected) => {
		expect(appealReminderDue(PAID_AT, at(day * DAY + 60_000))).toBe(expected);
	});

	it("never with an unknown payment time", () => {
		expect(appealReminderDue(null, at(13 * DAY))).toBe(false);
	});
});
