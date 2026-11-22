import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";
import { payoutMonitorService } from "./payoutMonitor.service";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("payoutMonitorService.getStatus (FR-A8, AC-F11)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const pay = (overrides: Record<string, unknown> = {}) =>
		makePayment({
			...ids,
			instructorNetCents: 4000,
			transferStatus: "pending",
			...overrides,
		});

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

	it("reports the last run, a crashed one as crashed, and staleness", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(50),
				finishedAt: hoursAgo(50),
			},
		});
		await testDb.payoutRun.create({
			data: { trigger: "cron", startedAt: hoursAgo(26) },
		});

		const status = await payoutMonitorService.getStatus(NOW);

		expect(status.lastRun).toMatchObject({ outcome: "crashed" });
		expect(status.lastSuccessAt).toEqual(hoursAgo(50));
		expect(status.stale).toBe(true);
		expect(status.history).toHaveLength(2);
	});

	it("sums held funds, and what is due within 7 days, over pending sales only", async () => {
		await pay({ paidAt: new Date(NOW.getTime() - 10 * DAY) }); // due soon
		await pay({ paidAt: new Date(NOW.getTime() - 1 * DAY) }); // later
		await pay({ transferStatus: "transferred" });
		await pay({
			status: "refunded",
			refundedAt: NOW,
			transferStatus: "cancelled",
		});

		const { heldFunds } = await payoutMonitorService.getStatus(NOW);

		expect(heldFunds).toEqual({
			count: 2,
			totalCents: 8000,
			dueSoonCents: 4000,
		});
	});

	it("lists each kind of problem payment, and only its own state (M8)", async () => {
		const overdue = await pay();
		await makeRefundRequest({
			paymentId: overdue.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
			refundError: "card declined",
			createdAt: hoursAgo(80),
		});
		const young = await pay();
		await makeRefundRequest({
			paymentId: young.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
			createdAt: hoursAgo(10),
		});
		const stuck = await pay({ transferStatus: "transferring" });
		await testDb.payment.update({
			where: { id: stuck.id },
			data: { updatedAt: hoursAgo(1) },
		});
		const unreversed = await pay({
			status: "refunded",
			refundedAt: hoursAgo(5),
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});

		const { problems } = await payoutMonitorService.getStatus(NOW);

		expect(problems.overdueRefunds).toEqual([
			expect.objectContaining({
				paymentId: overdue.id,
				error: "card declined",
			}),
		]);
		expect(problems.stuckTransfers.map((p) => p.paymentId)).toEqual([stuck.id]);
		expect(problems.pendingReversals.map((p) => p.paymentId)).toEqual([
			unreversed.id,
		]);
	});
});
