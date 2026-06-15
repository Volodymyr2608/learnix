import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb } from "@/test/db";
import { makeCourse, makeUser } from "@/test/factories";
import { paymentRepository } from "./payment.repository";

describe("PaymentRepository", () => {
	async function makePayment(
		overrides: Partial<{
			studentId: string;
			instructorId: string;
			courseId: string;
			stripeCheckoutSessionId: string;
			stripePaymentIntentId: string;
			amountCents: number;
			platformFeeCents: number;
			instructorNetCents: number;
			status: "pending" | "succeeded" | "failed" | "refunded";
			transferStatus: "none" | "pending" | "transferred" | "reversed";
			refundedAt: Date | null;
		}> & {
			studentId: string;
			instructorId: string;
			courseId: string;
		},
	) {
		return testDb.payment.create({
			data: {
				amountCents: 4999,
				platformFeeCents: 1000,
				instructorNetCents: 3999,
				status: "succeeded",
				transferStatus: "none",
				...overrides,
			},
		});
	}

	it("findBySessionId returns the correct payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripeCheckoutSessionId: "cs_test_abc123",
		});

		const found = await paymentRepository.findBySessionId("cs_test_abc123");
		expect(found?.id).toBe(payment.id);
		expect(found?.stripeCheckoutSessionId).toBe("cs_test_abc123");
	});

	it("findBySessionId returns null for an unknown session", async () => {
		const found = await paymentRepository.findBySessionId("cs_unknown");
		expect(found).toBeNull();
	});

	it("findByPaymentIntentId returns the correct payment", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			stripePaymentIntentId: "pi_test_xyz789",
		});

		const found = await paymentRepository.findByPaymentIntentId("pi_test_xyz789");
		expect(found?.id).toBe(payment.id);
		expect(found?.stripePaymentIntentId).toBe("pi_test_xyz789");
	});

	it("findByPaymentIntentId returns null for an unknown intent", async () => {
		const found = await paymentRepository.findByPaymentIntentId("pi_unknown");
		expect(found).toBeNull();
	});

	it("getOwedBalance sums instructorNetCents where transferStatus = pending", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		// Two pending transfers
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 3000,
			transferStatus: "pending",
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 2000,
			transferStatus: "pending",
		});
		// One already transferred — should not be included
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			instructorNetCents: 1500,
			transferStatus: "transferred",
		});

		const owed = await paymentRepository.getOwedBalance(instructor.id);
		expect(owed).toBe(5000);
	});

	it("getOwedBalance returns 0 when there are no pending transfers", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const owed = await paymentRepository.getOwedBalance(instructor.id);
		expect(owed).toBe(0);
	});

	it("getPlatformRevenue sums platformFeeCents for succeeded non-refunded payments", async () => {
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		const student = await makeUser({ role: Role.STUDENT });
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});

		// Two succeeded, non-refunded payments
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 800,
			status: "succeeded",
			refundedAt: null,
		});
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 1200,
			status: "succeeded",
			refundedAt: null,
		});
		// Refunded — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 500,
			status: "succeeded",
			refundedAt: new Date(),
		});
		// Failed — should be excluded
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			platformFeeCents: 300,
			status: "failed",
			refundedAt: null,
		});

		const revenue = await paymentRepository.getPlatformRevenue();
		expect(revenue).toBe(2000);
	});

	it("getPlatformRevenue returns 0 when there are no qualifying payments", async () => {
		const revenue = await paymentRepository.getPlatformRevenue();
		expect(revenue).toBe(0);
	});
});