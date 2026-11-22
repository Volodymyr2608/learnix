import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	apply: vi.fn(),
	findByPaymentIntentId: vi.fn(),
	recordDisputeState: vi.fn(),
	finalizeCheckout: vi.fn(),
	hasProcessingForPayment: vi.fn(),
	hasStripeRefundForPayment: vi.fn(),
}));
vi.mock("@/server/repositories/refundRequest.repository", () => ({
	refundRequestRepository: {
		hasProcessingForPayment: mocks.hasProcessingForPayment,
		hasStripeRefundForPayment: mocks.hasStripeRefundForPayment,
	},
}));
vi.mock("@/server/services/refund/refundEffects.service", () => ({
	refundEffectsService: { apply: mocks.apply },
}));
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: {
		findByPaymentIntentId: mocks.findByPaymentIntentId,
		recordDisputeState: mocks.recordDisputeState,
	},
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
		mocks.hasStripeRefundForPayment.mockResolvedValue(false);
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

	describe("dispute events (FR-P18a, FR-P18b, D9)", () => {
		const dispute = (type: string, status: string, created = 1_763_000_000) =>
			({
				id: "evt_d",
				type,
				created,
				data: {
					object: {
						id: "dp_1",
						status,
						payment_intent: "pi_1",
						charge: "ch_1",
					},
				},
			}) as unknown as Stripe.Event;

		beforeEach(() => {
			mocks.recordDisputeState.mockResolvedValue("pay_1");
		});

		it.each([
			["charge.dispute.created", "needs_response", "open"],
			["charge.dispute.updated", "under_review", "open"],
			["charge.dispute.closed", "won", "won"],
			["charge.dispute.closed", "warning_closed", "won"],
			["charge.dispute.closed", "lost", "lost"],
			["charge.dispute.closed", "prevented", "won"],
			["charge.dispute.created", "warning_needs_response", "open"],
			["charge.dispute.updated", "warning_under_review", "open"],
			["charge.dispute.updated", "lost", "lost"],
		])("%s with status %s stores %s", async (type, status, state) => {
			await stripeEventService.handle(dispute(type, status), NOW);

			expect(mocks.recordDisputeState).toHaveBeenCalledWith(
				"pi_1",
				state,
				1_763_000_000,
			);
		});

		it("applies the refund effects on a lost dispute", async () => {
			await stripeEventService.handle(
				dispute("charge.dispute.closed", "lost"),
				NOW,
			);

			expect(mocks.apply).toHaveBeenCalledWith({
				paymentId: "pay_1",
				path: "lost_dispute",
				now: NOW,
			});
		});

		it("applies nothing when the event is older than the stored state (D2)", async () => {
			mocks.recordDisputeState.mockResolvedValue(null);

			await stripeEventService.handle(
				dispute("charge.dispute.closed", "lost"),
				NOW,
			);

			expect(mocks.apply).not.toHaveBeenCalled();
		});

		it("applies nothing on a won dispute", async () => {
			await stripeEventService.handle(
				dispute("charge.dispute.closed", "won"),
				NOW,
			);

			expect(mocks.apply).not.toHaveBeenCalled();
		});
	});
});
