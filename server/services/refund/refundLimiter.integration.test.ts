import { beforeEach, describe, expect, it, vi } from "vitest";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { __resetWindowsForTest } from "@/server/services/_shared/aiLimits/checkAiRateLimit";
import { MAX_REFUND_REQUESTS_PER_WINDOW } from "@/server/services/_shared/aiLimits/checkRefundRequestRateLimit";
import { refundService } from "@/server/services/refund/refund.service";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => true,
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: {
			retrieve: vi.fn().mockResolvedValue({
				latest_charge: { id: "ch_1", disputed: false, refunded: false },
			}),
		},
		refunds: {
			list: vi.fn().mockResolvedValue({ data: [] }),
			create: vi.fn().mockResolvedValue({ id: "re_1", status: "pending" }),
		},
	},
}));

const DAY = 24 * 60 * 60 * 1000;

describe("refund.request is rate-limited and its lock wait bounded (U9)", () => {
	let studentId: string;
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		await __resetWindowsForTest();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			paidAt: new Date(Date.now() - DAY),
		});
		studentId = student.id;
		paymentId = payment.id;
	});

	it("refuses the request over the limit before opening a transaction", async () => {
		for (let i = 0; i < MAX_REFUND_REQUESTS_PER_WINDOW; i++) {
			await expect(
				refundService.requestRefund(studentId, {
					paymentId: `missing-${i}`,
					reason: "too_easy",
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		}
		const lock = vi.spyOn(refundRequestRepository, "lockStudent");

		await expect(
			refundService.requestRefund(studentId, { paymentId, reason: "too_easy" }),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		expect(lock).not.toHaveBeenCalled();
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("gives up waiting for the student lock with a typed 'try again' error, writing nothing", async () => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let locked: () => void = () => {};
		const isLocked = new Promise<void>((resolve) => {
			locked = resolve;
		});
		const holder = testDb.$transaction(
			async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund:${studentId}`}))`;
				locked();
				await held;
			},
			{ timeout: 20_000 },
		);
		await isLocked;

		try {
			await expect(
				refundService.requestRefund(studentId, {
					paymentId,
					reason: "too_easy",
				}),
			).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		} finally {
			release();
			await holder;
		}
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("still refunds a normal request", async () => {
		const result = await refundService.requestRefund(studentId, {
			paymentId,
			reason: "too_easy",
		});

		expect(result.decision).toBe("auto_approved");
	});
});
