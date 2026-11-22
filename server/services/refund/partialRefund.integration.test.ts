import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeUser,
} from "@/test/factories";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => true,
}));
const stripeMock = vi.hoisted(() => ({
	refundsCreate: vi.fn(),
	refundsList: vi.fn(),
	piRetrieve: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		transfers: { listReversals: vi.fn(), createReversal: vi.fn() },
	},
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { stripeEventService } = await import(
	"@/server/services/payments/stripeEvent.service"
);
const { refundService } = await import("./refund.service");

const partial = (amountRefunded: number): Stripe.Event =>
	({
		id: `evt_partial_${amountRefunded}`,
		type: "charge.refunded",
		data: {
			object: {
				id: "ch_1",
				amount: 4900,
				amount_refunded: amountRefunded,
				payment_intent: "pi_partial",
			},
		},
	}) as unknown as Stripe.Event;

describe("a partial Dashboard refund, then a request (FR-P16, EC-19, AC-F15)", () => {
	let studentId: string;
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em" });
		await makeUser({ role: "ADMIN" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 4900,
			transferStatus: "pending",
			paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
			stripePaymentIntentId: "pi_partial",
		});
		studentId = student.id;
		paymentId = payment.id;
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch_1",
				amount: 4900,
				disputed: false,
				refunded: false,
			},
		});
		stripeMock.refundsList.mockResolvedValue({
			data: [{ id: "re_partial", amount: 1000, status: "succeeded" }],
		});
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_rest",
			status: "succeeded",
		});
	});

	it("records the refunded amount and changes nothing else", async () => {
		await stripeEventService.handle(partial(1000), new Date());

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({
			refundedAmountCents: 1000,
			status: "succeeded",
			transferStatus: "pending",
		});
		expect(
			(await testDb.enrollment.findFirstOrThrow({ where: { studentId } }))
				.status,
		).toBe("active");
	});

	it("shows the remainder on the form, refunds the remainder, and says so after", async () => {
		await stripeEventService.handle(partial(1000), new Date());

		const before = await refundService.getRefundPage(studentId, paymentId);
		expect(before.state).toMatchObject({ kind: "form", amountCents: 3900 });

		const result = await refundService.requestRefund(studentId, {
			paymentId,
			reason: "too_easy",
		});
		expect(result.refundStatus).toBe("refunded");
		expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
			{ payment_intent: "pi_partial" },
			expect.anything(),
		);

		const after = await refundService.getRefundPage(studentId, paymentId);
		expect(after.state).toMatchObject({
			kind: "status",
			status: "refunded",
			amountCents: 3900,
		});
		const done = send.mock.calls.filter(
			([a]) => a.templateKey === "refund.done",
		);
		expect(done[0]?.[0].payload.amount).toBe("$39.00");
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }))
				.transferStatus,
		).toBe("cancelled");
	});
});
