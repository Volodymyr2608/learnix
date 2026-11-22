import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	apply: vi.fn(),
	findByPaymentIntentId: vi.fn(),
	finalizeCheckout: vi.fn(),
	hasProcessingForPayment: vi.fn(),
}));
vi.mock("@/server/repositories/refundRequest.repository", () => ({
	refundRequestRepository: {
		hasProcessingForPayment: mocks.hasProcessingForPayment,
	},
}));
vi.mock("@/server/services/refund/refundEffects.service", () => ({
	refundEffectsService: { apply: mocks.apply },
}));
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: { findByPaymentIntentId: mocks.findByPaymentIntentId },
}));
vi.mock("./payment.service", () => ({
	paymentService: { finalizeCheckout: mocks.finalizeCheckout },
}));
vi.mock("./connect.service", () => ({ connectService: {} }));

const { stripeEventService } = await import("./stripeEvent.service");

const NOW = new Date("2026-11-20T10:00:00.000Z");
const refunded = (amount: number, amountRefunded: number) =>
	({
		id: "evt_1",
		type: "charge.refunded",
		data: {
			object: {
				id: "ch_1",
				amount,
				amount_refunded: amountRefunded,
				payment_intent: "pi_1",
			},
		},
	}) as unknown as Stripe.Event;

describe("stripeEventService.handle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findByPaymentIntentId.mockResolvedValue({ id: "pay_1" });
		mocks.apply.mockResolvedValue(true);
		mocks.hasProcessingForPayment.mockResolvedValue(false);
	});

	it("labels the refund as the student's own when a request is processing (qa #4, R4)", async () => {
		mocks.hasProcessingForPayment.mockResolvedValue(true);

		await stripeEventService.handle(refunded(4999, 4999), NOW);

		expect(mocks.apply).toHaveBeenCalledWith(
			expect.objectContaining({ path: "refund_request" }),
		);
	});

	it("applies the refund effects for a full charge.refunded (Dashboard refund)", async () => {
		await stripeEventService.handle(refunded(4999, 4999), NOW);

		expect(mocks.findByPaymentIntentId).toHaveBeenCalledWith("pi_1");
		expect(mocks.apply).toHaveBeenCalledWith({
			paymentId: "pay_1",
			path: "dashboard_refund",
			now: NOW,
		});
	});

	it("applies nothing for a partial refund (R2, FR-P16 later)", async () => {
		await stripeEventService.handle(refunded(4999, 1000), NOW);

		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("ignores a refund for a payment Learnix does not know", async () => {
		mocks.findByPaymentIntentId.mockResolvedValue(null);

		await stripeEventService.handle(refunded(4999, 4999), NOW);

		expect(mocks.apply).not.toHaveBeenCalled();
	});

	it("finalizes a completed checkout session", async () => {
		await stripeEventService.handle(
			{
				id: "evt_2",
				type: "checkout.session.completed",
				data: { object: { id: "cs_1" } },
			} as unknown as Stripe.Event,
			NOW,
		);

		expect(mocks.finalizeCheckout).toHaveBeenCalledWith("cs_1");
	});
});
