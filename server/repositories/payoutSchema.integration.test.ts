import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makePayment, makeUser } from "@/test/factories";

describe("payout hold schema", () => {
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
		});
		paymentId = payment.id;
	});

	it.each([
		"transferring",
		"cancelled",
	] as const)("lets a payment's transfer be %s", async (transferStatus) => {
		const updated = await testDb.payment.update({
			where: { id: paymentId },
			data: { transferStatus },
		});
		expect(updated.transferStatus).toBe(transferStatus);
	});

	it("records a payout run with its failures and payment ids (FR-P5)", async () => {
		const run = await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				finishedAt: new Date(),
				processed: 2,
				released: 1,
				failures: [{ paymentId, error: "Stripe timeout" }],
				paymentIds: [paymentId, "pay_2"],
			},
		});

		const stored = await testDb.payoutRun.findUniqueOrThrow({
			where: { id: run.id },
		});
		expect(stored.startedAt).toBeInstanceOf(Date);
		expect(stored.failures).toEqual([{ paymentId, error: "Stripe timeout" }]);
		expect(stored.paymentIds).toEqual([paymentId, "pay_2"]);
	});

	it("truncateAll empties payout_runs", async () => {
		await testDb.payoutRun.create({ data: { trigger: "manual" } });
		await truncateAll();
		expect(await testDb.payoutRun.count()).toBe(0);
	});
});
