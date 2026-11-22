import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { transfers: { listReversals: vi.fn(), createReversal: vi.fn() } },
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { stripeEventService } = await import("./stripeEvent.service");

const T = 1_763_000_000;
const dispute = (type: string, status: string, created: number): Stripe.Event =>
	({
		id: `evt_${type}_${status}_${created}`,
		type,
		created,
		data: {
			object: {
				id: "dp_1",
				status,
				payment_intent: "pi_disputed",
				charge: "ch_1",
			},
		},
	}) as unknown as Stripe.Event;

describe("dispute events set the stored state; a lost dispute refunds (FR-P18a/b, AC-F22)", () => {
	let paymentId: string;
	let studentId: string;
	let courseId: string;

	const payment = () =>
		testDb.payment.findUniqueOrThrow({ where: { id: paymentId } });

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		studentId = (await makeUser()).id;
		const course = await makeCourse({ instructorId: instructor.id });
		courseId = course.id;
		await makeEnrollment({ studentId, courseId: course.id });
		paymentId = (
			await makePayment({
				studentId,
				instructorId: instructor.id,
				courseId: course.id,
				transferStatus: "pending",
				stripePaymentIntentId: "pi_disputed",
			})
		).id;
	});

	it("opens on created, applies the effects once on a lost close", async () => {
		await stripeEventService.handle(
			dispute("charge.dispute.created", "needs_response", T),
			new Date(),
		);
		expect((await payment()).disputeState).toBe("open");

		const lost = dispute("charge.dispute.closed", "lost", T + 10);
		await stripeEventService.handle(lost, new Date());
		await stripeEventService.handle(lost, new Date());

		expect(await payment()).toMatchObject({
			disputeState: "lost",
			status: "refunded",
			refundSource: "lost_dispute",
			transferStatus: "cancelled",
		});
		expect(
			(await testDb.enrollment.findFirstOrThrow({ where: { studentId } }))
				.status,
		).toBe("cancelled");
	});

	it("clears to won and leaves the payment paid", async () => {
		await stripeEventService.handle(
			dispute("charge.dispute.created", "needs_response", T),
			new Date(),
		);
		await stripeEventService.handle(
			dispute("charge.dispute.closed", "won", T + 10),
			new Date(),
		);

		expect(await payment()).toMatchObject({
			disputeState: "won",
			status: "succeeded",
		});
	});

	it("ignores a late created event after the close (D2)", async () => {
		await stripeEventService.handle(
			dispute("charge.dispute.closed", "won", T + 10),
			new Date(),
		);
		await stripeEventService.handle(
			dispute("charge.dispute.created", "needs_response", T),
			new Date(),
		);

		expect((await payment()).disputeState).toBe("won");
	});

	it("keeps a closed state when an open event shares its second, in either order (qa #1)", async () => {
		await stripeEventService.handle(
			dispute("charge.dispute.closed", "won", T),
			new Date(),
		);
		await stripeEventService.handle(
			dispute("charge.dispute.updated", "under_review", T),
			new Date(),
		);
		expect((await payment()).disputeState).toBe("won");
	});

	it("still lets a same-second closed event replace open", async () => {
		await stripeEventService.handle(
			dispute("charge.dispute.updated", "under_review", T),
			new Date(),
		);
		await stripeEventService.handle(
			dispute("charge.dispute.closed", "lost", T),
			new Date(),
		);
		expect(await payment()).toMatchObject({
			disputeState: "lost",
			status: "refunded",
		});
	});

	it("treats a lost dispute as the student's own refund when Learnix's Stripe refund already went through (audit L2)", async () => {
		await makeRefundRequest({
			paymentId,
			studentId,
			courseId,
			refundState: "processing",
			stripeRefundId: "re_made",
		});

		await stripeEventService.handle(
			dispute("charge.dispute.closed", "lost", T),
			new Date(),
		);

		expect(await payment()).toMatchObject({
			refundSource: "refund_request",
			status: "refunded",
		});
		expect(
			(await testDb.refundRequest.findFirstOrThrow({ where: { paymentId } }))
				.refundState,
		).toBe("refunded");
	});
});
