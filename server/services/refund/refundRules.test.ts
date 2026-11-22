import { describe, expect, it } from "vitest";
import type { RefundFacts } from "@/server/entities/refund/refund.dto";
import {
	decideRefund,
	isInsideRefundWindow,
	REFUND_WINDOW_MS,
	refundThreshold,
} from "./refundRules";

const PAID_AT = new Date("2026-11-01T10:00:00.000Z");
const NOW = new Date("2026-11-04T10:00:00.000Z");
const SECOND = 1000;

const facts = (overrides: Partial<RefundFacts> = {}): RefundFacts => ({
	paidAt: PAID_AT,
	lessonCount: 6,
	openedCount: 2,
	hasCertificate: false,
	hasEarlierCountingRefund: false,
	accountLimitRefunds12m: 0,
	hasOpenDispute: false,
	...overrides,
});

describe("refundThreshold (AC-F3)", () => {
	it.each([
		[0, 0],
		[1, 0],
		[2, 1],
		[3, 1],
		[4, 2],
		[5, 2],
		[6, 3],
		[7, 3],
		[20, 3],
	])("L = %i → %i", (lessonCount, expected) => {
		expect(refundThreshold(lessonCount)).toBe(expected);
	});
});

describe("isInsideRefundWindow (AC-F4)", () => {
	it("is 14 × 24 h", () => {
		expect(REFUND_WINDOW_MS).toBe(14 * 24 * 60 * 60 * 1000);
	});

	it("is inside at 14 d − 1 s", () => {
		const now = new Date(PAID_AT.getTime() + REFUND_WINDOW_MS - SECOND);
		expect(isInsideRefundWindow(PAID_AT, now)).toBe(true);
	});

	it("is outside at exactly 14 d", () => {
		const now = new Date(PAID_AT.getTime() + REFUND_WINDOW_MS);
		expect(isInsideRefundWindow(PAID_AT, now)).toBe(false);
	});

	it("is outside when paidAt is unknown (P4, fail closed)", () => {
		expect(isInsideRefundWindow(null, NOW)).toBe(false);
	});
});

describe("decideRefund", () => {
	it("approves automatically when every condition holds (AC-F2)", () => {
		const result = decideRefund(facts(), NOW);
		expect(result.decision).toBe("auto_approved");
		expect(result.failedConditions).toEqual([]);
	});

	it.each([
		["window", { paidAt: new Date("2026-10-01T00:00:00.000Z") }],
		["threshold", { openedCount: 4 }],
		["certificate", { hasCertificate: true }],
		["earlier_refund", { hasEarlierCountingRefund: true }],
		["account_limit", { accountLimitRefunds12m: 3 }],
		["dispute", { hasOpenDispute: true }],
	] as const)("denies naming only %s when it alone fails (AC-F5)", (condition, override) => {
		const result = decideRefund(facts(override), NOW);
		expect(result.decision).toBe("auto_denied");
		expect(result.failedConditions).toEqual([condition]);
	});

	it("allows opened = threshold and denies threshold + 1", () => {
		expect(decideRefund(facts({ openedCount: 3 }), NOW).decision).toBe(
			"auto_approved",
		);
		expect(decideRefund(facts({ openedCount: 4 }), NOW).decision).toBe(
			"auto_denied",
		);
	});

	it("allows 2 account-limit refunds and denies 3", () => {
		expect(
			decideRefund(facts({ accountLimitRefunds12m: 2 }), NOW).decision,
		).toBe("auto_approved");
		expect(
			decideRefund(facts({ accountLimitRefunds12m: 3 }), NOW).decision,
		).toBe("auto_denied");
	});

	it("names every failed condition in the fixed order", () => {
		const result = decideRefund(
			facts({ hasOpenDispute: true, paidAt: null, hasCertificate: true }),
			NOW,
		);
		expect(result.failedConditions).toEqual([
			"window",
			"certificate",
			"dispute",
		]);
	});

	it("freezes the facts, threshold and each condition in the snapshot (FR-S5)", () => {
		const { snapshot } = decideRefund(facts({ openedCount: 4 }), NOW);
		expect(snapshot).toEqual({
			paidAt: PAID_AT.toISOString(),
			windowEndsAt: new Date(
				PAID_AT.getTime() + REFUND_WINDOW_MS,
			).toISOString(),
			evaluatedAt: NOW.toISOString(),
			lessonCount: 6,
			openedCount: 4,
			threshold: 3,
			hasCertificate: false,
			hasEarlierCountingRefund: false,
			accountLimitRefunds12m: 0,
			hasOpenDispute: false,
			conditions: {
				window: true,
				threshold: false,
				certificate: true,
				earlier_refund: true,
				account_limit: true,
				dispute: true,
			},
		});
	});

	it("records a null window end when paidAt is unknown", () => {
		const { snapshot } = decideRefund(facts({ paidAt: null }), NOW);
		expect(snapshot.paidAt).toBeNull();
		expect(snapshot.windowEndsAt).toBeNull();
	});
});
