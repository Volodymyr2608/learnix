import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

describe("dispute schema (D1, D3, D5)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
	});

	it("stores a payment's dispute state, its event time and its refund source", async () => {
		const payment = await makePayment(ids);
		const updated = await testDb.payment.update({
			where: { id: payment.id },
			data: {
				disputeState: "lost",
				disputeUpdatedAt: 1_763_000_000,
				refundSource: "lost_dispute",
			},
		});
		expect(updated).toMatchObject({
			disputeState: "lost",
			disputeUpdatedAt: 1_763_000_000,
			refundSource: "lost_dispute",
		});
	});

	it("closes a request as refunded by the bank", async () => {
		const payment = await makePayment(ids);
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "refunded_by_bank",
		});
		expect(request.refundState).toBe("refunded_by_bank");
	});
});
