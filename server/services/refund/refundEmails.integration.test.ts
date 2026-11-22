import { beforeEach, describe, expect, it, vi } from "vitest";
import { emailTemplates } from "@/server/services/email/email.templates";
import { truncateAll } from "@/test/db";
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
	},
}));

const { refundService } = await import("./refund.service");
const { refundEffectsService } = await import("./refundEffects.service");

const DAY = 24 * 60 * 60 * 1000;
const sentWith = (templateKey: string) =>
	send.mock.calls.filter(([arg]) => arg.templateKey === templateKey);

describe("student refund emails (U10, AC-F21)", () => {
	let student: { id: string; email: string };
	let paymentId: string;

	const seed = async (paidAt = new Date(Date.now() - DAY)) => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const s = await makeUser({ name: "Ada" });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust",
		});
		await makeEnrollment({ studentId: s.id, courseId: course.id });
		const payment = await makePayment({
			studentId: s.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 4900,
			paidAt,
			stripePaymentIntentId: `pi_${Math.random().toString(36).slice(2)}`,
		});
		student = s;
		paymentId = payment.id;
	};

	beforeEach(async () => {
		await truncateAll();
		send.mockReset();
		send.mockResolvedValue({ id: "em_1" });
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch_1",
				amount: 4900,
				disputed: false,
				refunded: false,
			},
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: `re_${Math.random().toString(36).slice(2)}`,
			status: "succeeded",
		});
	});

	it("emails 'refund done' once when an automatic refund succeeds at once", async () => {
		await seed();

		const result = await refundService.requestRefund(student.id, {
			paymentId,
			reason: "too_easy",
			text: "my private reason",
		});

		expect(result.refundStatus).toBe("refunded");
		const done = sentWith("refund.done");
		expect(done).toHaveLength(1);
		expect(done[0]?.[0]).toMatchObject({
			toEmail: student.email,
			payload: { name: "Ada", courseTitle: "Rust", amount: "$49.00" },
		});
		expect(JSON.stringify(send.mock.calls)).not.toContain("my private reason");
	});

	it("emails only when a processing refund completes, and once on a replay", async () => {
		await seed();
		stripeMock.refundsCreate.mockRejectedValueOnce(new Error("Stripe 500"));

		const first = await refundService.requestRefund(student.id, {
			paymentId,
			reason: "too_easy",
		});
		expect(first.refundStatus).toBe("processing");
		expect(sentWith("refund.done")).toHaveLength(0);

		await refundService.executeRefund(first.requestId, new Date());
		await refundEffectsService.apply({
			paymentId,
			path: "refund_request",
			now: new Date(),
		});

		expect(sentWith("refund.done")).toHaveLength(1);
	});

	it("emails 'denied' once, naming the condition and no free text", async () => {
		await seed(new Date(Date.now() - 15 * DAY));

		const result = await refundService.requestRefund(student.id, {
			paymentId,
			reason: "other",
			text: "my private reason",
		});

		expect(result.decision).toBe("auto_denied");
		const denied = sentWith("refund.denied");
		expect(denied).toHaveLength(1);
		expect(denied[0]?.[0].payload).toMatchObject({
			courseTitle: "Rust",
			condition: "The 14-day refund period has ended.",
		});
		expect(sentWith("refund.done")).toHaveLength(0);
		expect(JSON.stringify(send.mock.calls)).not.toContain("my private reason");
	});

	it("sends no student email for a Dashboard refund", async () => {
		await seed();

		await refundEffectsService.apply({
			paymentId,
			path: "dashboard_refund",
			now: new Date(),
		});

		expect(send).not.toHaveBeenCalled();
	});

	it("rejects a payload carrying free text", () => {
		const base = { name: "Ada", courseTitle: "Rust" };
		expect(
			emailTemplates["refund.done"].payload.safeParse({
				...base,
				amount: "$49.00",
				text: "x",
			}).success,
		).toBe(false);
		expect(
			emailTemplates["refund.denied"].payload.safeParse({
				...base,
				condition: "c",
				text: "x",
			}).success,
		).toBe(false);
	});
});
