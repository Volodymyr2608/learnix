import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

describe("refund slice-9 schema (Task 1, W1)", () => {
	let paymentId: string;
	let ids: { studentId: string; courseId: string };

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		paymentId = (
			await makePayment({
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
			})
		).id;
		ids = { studentId: student.id, courseId: course.id };
	});

	it("stores the fee, the refunded amount, the bank failure and the duplicate-charge source", async () => {
		const at = new Date();
		const stored = await testDb.payment.update({
			where: { id: paymentId },
			data: {
				stripeFeeCents: 175,
				refundedAmountCents: 1000,
				bankFailureAt: at,
				refundSource: "duplicate_charge",
			},
		});

		expect(stored).toMatchObject({
			stripeFeeCents: 175,
			refundedAmountCents: 1000,
			bankFailureAt: at,
			refundSource: "duplicate_charge",
		});
	});

	it("closes an appeal as account deleted and audits both bank-failure outcomes", async () => {
		const request = await makeRefundRequest({
			paymentId,
			...ids,
			decision: "auto_denied",
		});
		const appeal = await makeAppeal({ requestId: request.id });

		await testDb.refundAppeal.update({
			where: { id: appeal.id },
			data: { status: "closed_account_deleted" },
		});
		await testDb.refundAudit.createMany({
			data: [
				{ kind: "bank_failure_refunded_elsewhere", paymentId },
				{ kind: "bank_failure_sale_stands", paymentId },
			],
		});

		expect(await testDb.refundAudit.count()).toBe(2);
	});
});
