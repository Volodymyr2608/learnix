import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConversation,
	makeCourse,
	makeEnrollment,
	makePayment,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { transfers: { listReversals: vi.fn(), createReversal: vi.fn() } },
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));
// The student flag is off: a Dashboard refund must still apply every effect (AC-F30).
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => false,
}));

const { stripeEventService } = await import("./stripeEvent.service");

describe("a Dashboard refund with the student flag off (AC-F30, FR-P6–P13)", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("applies the refund effects through the shared handler, once", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		await makeConversation({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 4999,
			transferStatus: "pending",
			stripePaymentIntentId: "pi_dash",
		});
		const event = {
			id: "evt_dash",
			type: "charge.refunded",
			data: {
				object: {
					id: "ch_dash",
					amount: 4999,
					amount_refunded: 4999,
					payment_intent: "pi_dash",
				},
			},
		} as unknown as Stripe.Event;

		await stripeEventService.handle(event, new Date());
		await stripeEventService.handle(event, new Date());

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }),
		).toMatchObject({
			status: "refunded",
			transferStatus: "cancelled",
		});
		expect(
			(
				await testDb.enrollment.findFirstOrThrow({
					where: { studentId: student.id },
				})
			).status,
		).toBe("cancelled");
		expect(
			(await testDb.conversation.findFirstOrThrow()).closedAt,
		).toBeInstanceOf(Date);
	});
});
