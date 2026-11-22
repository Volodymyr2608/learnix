import { describe, expect, it } from "vitest";
import type {
	PurchaseRowFacts,
	RefundPageFacts,
	RefundRequestView,
} from "@/server/entities/refund/refundView.dto";
import {
	purchaseRefundRowState,
	refundPageState,
	refundWindowEndsAt,
} from "./refundView";

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;
const PAID_AT = new Date("2026-11-01T22:30:00.000Z");
const at = (ms: number) => new Date(PAID_AT.getTime() + ms);
const NOW = at(2 * DAY);
const WINDOW_END = at(14 * DAY);

const row = (overrides: Partial<PurchaseRowFacts> = {}): PurchaseRowFacts => ({
	paidAt: PAID_AT,
	paymentRefunded: false,
	hasCertificate: false,
	hasEarlierCountingRefund: false,
	hasOpenDispute: false,
	request: null,
	...overrides,
});

const request = (
	overrides: Partial<RefundRequestView> = {},
): RefundRequestView => ({
	decision: "auto_approved",
	refundState: "processing",
	failedConditions: [],
	reason: "too_easy",
	text: null,
	createdAt: at(DAY),
	refundedAt: null,
	...overrides,
});

const page = (overrides: Partial<RefundPageFacts> = {}): RefundPageFacts => ({
	...row(),
	request: null,
	lessonCount: 6,
	openedCount: 1,
	accountLimitRefunds12m: 0,
	amountCents: 4900,
	currency: "usd",
	...overrides,
});

describe("refundWindowEndsAt", () => {
	it("is paidAt + 14 × 24 h, or null when the payment time is unknown", () => {
		expect(refundWindowEndsAt(PAID_AT)).toEqual(WINDOW_END);
		expect(refundWindowEndsAt(null)).toBeNull();
	});
});

describe("purchaseRefundRowState (FR-S1, S8–S12, U2)", () => {
	it("offers the action with the window end inside the window", () => {
		expect(purchaseRefundRowState(row(), NOW)).toEqual({
			kind: "request",
			windowEndsAt: WINDOW_END,
		});
	});

	it.each([
		["window closed", row(), WINDOW_END],
		["window closed, unknown paidAt", row({ paidAt: null }), NOW],
		["certificate", row({ hasCertificate: true }), NOW],
		["earlier counting refund", row({ hasEarlierCountingRefund: true }), NOW],
		["open dispute", row({ hasOpenDispute: true }), NOW],
		[
			"refunded without a request (Dashboard)",
			row({ paymentRefunded: true }),
			NOW,
		],
	])("shows nothing: %s", (_label, facts, now) => {
		expect(purchaseRefundRowState(facts, now)).toEqual({ kind: "none" });
	});

	it("shows the action at 14 d − 1 s and nothing at 14 d (AC-F4)", () => {
		expect(purchaseRefundRowState(row(), at(14 * DAY - SECOND)).kind).toBe(
			"request",
		);
		expect(purchaseRefundRowState(row(), at(14 * DAY)).kind).toBe("none");
	});

	it.each([
		["processing", request(), "processing"],
		["refunded", request({ refundState: "refunded" }), "refunded"],
		[
			"refunded by the bank",
			request({ refundState: "refunded_by_bank" }),
			"refunded",
		],
		[
			"denied",
			request({ decision: "auto_denied", refundState: null }),
			"denied",
		],
	] as const)("shows the request status: %s", (_label, req, status) => {
		expect(purchaseRefundRowState(row({ request: req }), NOW)).toEqual({
			kind: "status",
			status,
		});
	});

	it("puts the request status before every other fact", () => {
		const facts = row({
			request: request(),
			hasOpenDispute: true,
			hasCertificate: true,
		});
		expect(purchaseRefundRowState(facts, WINDOW_END)).toEqual({
			kind: "status",
			status: "processing",
		});
	});
});

describe("refundPageState (FR-S3–S12, S19, S20, U3, U4)", () => {
	it("shows the form with the amount and window end when every condition holds", () => {
		expect(refundPageState(page(), NOW)).toEqual({
			kind: "form",
			amountCents: 4900,
			currency: "usd",
			windowEndsAt: WINDOW_END,
		});
	});

	it("shows the request's own status with its details", () => {
		const req = request({
			refundState: "refunded",
			refundedAt: at(DAY),
			reason: "other",
			text: "<img src=x onerror=alert(1)>",
		});
		expect(
			refundPageState(page({ request: req, paymentRefunded: true }), NOW),
		).toEqual({
			kind: "status",
			status: "refunded",
			amountCents: 4900,
			currency: "usd",
			reason: "other",
			text: "<img src=x onerror=alert(1)>",
			submittedAt: at(DAY),
			refundedAt: at(DAY),
			failedConditions: [],
		});
	});

	it("names the failed conditions of a denied request (FR-S14)", () => {
		const req = request({
			decision: "auto_denied",
			refundState: null,
			failedConditions: ["threshold"],
		});
		const state = refundPageState(page({ request: req }), NOW);
		expect(state).toMatchObject({
			kind: "status",
			status: "denied",
			failedConditions: ["threshold"],
		});
	});

	it.each([
		[
			"a Dashboard refund",
			page({ paymentRefunded: true }),
			{ kind: "payment_refunded" },
		],
		["an open dispute", page({ hasOpenDispute: true }), { kind: "dispute" }],
		["a certificate", page({ hasCertificate: true }), { kind: "certificate" }],
		[
			"an earlier counting refund",
			page({ hasEarlierCountingRefund: true }),
			{ kind: "already_refunded" },
		],
	])("explains %s", (_label, facts, expected) => {
		expect(refundPageState(facts, NOW)).toEqual(expected);
	});

	it("says when the window ended (FR-S8)", () => {
		expect(refundPageState(page(), WINDOW_END)).toEqual({
			kind: "window_closed",
			endedAt: WINDOW_END,
		});
		expect(refundPageState(page({ paidAt: null }), NOW)).toEqual({
			kind: "window_closed",
			endedAt: null,
		});
	});

	it("names the threshold and its numbers, with no form (FR-S13 naming, U4)", () => {
		expect(refundPageState(page({ openedCount: 4 }), NOW)).toEqual({
			kind: "over_limit",
			exceeded: [{ condition: "threshold", openedCount: 4, threshold: 3 }],
		});
	});

	it("names the account limit and both when both are exceeded", () => {
		expect(
			refundPageState(page({ openedCount: 4, accountLimitRefunds12m: 3 }), NOW),
		).toEqual({
			kind: "over_limit",
			exceeded: [
				{ condition: "threshold", openedCount: 4, threshold: 3 },
				{ condition: "account_limit", refunds: 3, limit: 3 },
			],
		});
	});

	it("checks the dispute before the window and the request before the dispute", () => {
		expect(
			refundPageState(page({ hasOpenDispute: true }), WINDOW_END).kind,
		).toBe("dispute");
		expect(
			refundPageState(page({ hasOpenDispute: true, request: request() }), NOW)
				.kind,
		).toBe("status");
	});
});
