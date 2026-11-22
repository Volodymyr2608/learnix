import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
	},
}));
const repo = vi.hoisted(() => ({
	findForRefund: vi.fn(),
	recordStripeRefund: vi.fn(),
	recordRefundError: vi.fn(),
	markRefunded: vi.fn(),
}));
vi.mock("@/server/repositories/refundRequest.repository", () => ({
	refundRequestRepository: repo,
}));
const effects = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock("./refundEffects.service", () => ({ refundEffectsService: effects }));

const { refundService } = await import("./refund.service");

const NOW = new Date("2026-11-20T10:00:00.000Z");
const charge = (disputed = false) =>
	stripeMock.piRetrieve.mockResolvedValue({
		latest_charge: { id: "ch_1", disputed, refunded: false },
	});

describe("refundService.executeRefund (FR-S6, FR-S20, C2, C3, C12)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		repo.findForRefund.mockResolvedValue({
			id: "req_1",
			refundState: "processing",
			payment: { id: "pay_1", stripePaymentIntentId: "pi_1" },
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_1",
			status: "succeeded",
		});
		effects.apply.mockResolvedValue(true);
		charge();
	});

	it("creates the refund with exactly the stored payment intent and a key, then applies the effects (AC-C2)", async () => {
		expect(await refundService.executeRefund("req_1", NOW)).toBe("refunded");

		expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
			{ payment_intent: "pi_1" },
			{ idempotencyKey: "refund:pay_1" },
		);
		expect(repo.recordStripeRefund).toHaveBeenCalledWith("req_1", "re_1");
		expect(effects.apply).toHaveBeenCalledWith({
			paymentId: "pay_1",
			path: "refund_request",
			now: NOW,
		});
	});

	it("uses a refund Stripe already made instead of creating another (C7)", async () => {
		stripeMock.refundsList.mockResolvedValue({
			data: [{ id: "re_old", status: "succeeded" }],
		});

		expect(await refundService.executeRefund("req_1", NOW)).toBe("refunded");
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
		expect(repo.recordStripeRefund).toHaveBeenCalledWith("req_1", "re_old");
	});

	it("treats charge_already_refunded as success (AC-C3)", async () => {
		stripeMock.refundsCreate.mockRejectedValue(
			new Stripe.errors.StripeInvalidRequestError({
				type: "invalid_request_error",
				code: "charge_already_refunded",
				message: "Charge ch_1 has already been refunded.",
			}),
		);

		expect(await refundService.executeRefund("req_1", NOW)).toBe("refunded");
		expect(effects.apply).toHaveBeenCalled();
	});

	it("never refunds a disputed charge (AC-C12, R3)", async () => {
		charge(true);

		expect(await refundService.executeRefund("req_1", NOW)).toBe("processing");
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
		expect(repo.recordRefundError).toHaveBeenCalledWith(
			"req_1",
			"charge disputed",
		);
		expect(effects.apply).not.toHaveBeenCalled();
	});

	it("stays processing on a Stripe failure and keeps Stripe's message for the admin only (FR-S20)", async () => {
		stripeMock.refundsCreate.mockRejectedValue(
			new Error("Your card was declined"),
		);

		expect(await refundService.executeRefund("req_1", NOW)).toBe("processing");
		expect(repo.recordRefundError).toHaveBeenCalledWith(
			"req_1",
			"Your card was declined",
		);
		expect(effects.apply).not.toHaveBeenCalled();
	});

	it("marks the request refunded when another path already applied the effects", async () => {
		effects.apply.mockResolvedValue(false);

		expect(await refundService.executeRefund("req_1", NOW)).toBe("refunded");
		expect(repo.markRefunded).toHaveBeenCalledWith("req_1", NOW);
	});

	it("does nothing for a request that is not processing", async () => {
		repo.findForRefund.mockResolvedValue({
			id: "req_1",
			refundState: "refunded",
			payment: { id: "pay_1", stripePaymentIntentId: "pi_1" },
		});

		expect(await refundService.executeRefund("req_1", NOW)).toBe("refunded");
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});
});
