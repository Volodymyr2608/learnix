import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));

const { payoutWatchdogService } = await import("./payoutWatchdog.service");

const NOW = new Date("2026-11-20T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);
const templates = () => send.mock.calls.map((c) => c[0].templateKey).sort();

describe("payoutWatchdogService.check (FR-A10, FR-A11, M3)", () => {
	beforeEach(async () => {
		await truncateAll();
		send.mockReset();
		send.mockResolvedValue({ id: "em" });
		await makeUser({ role: "ADMIN" });
	});

	it("alerts when the last success is 49 h old", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(49),
				finishedAt: hoursAgo(49),
			},
		});

		expect(await payoutWatchdogService.check(NOW)).toMatchObject({
			stale: true,
		});
		expect(templates()).toEqual(["admin.payout-stale"]);
	});

	it("stays quiet 47 h after a success", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(47),
				finishedAt: hoursAgo(47),
			},
		});

		expect(await payoutWatchdogService.check(NOW)).toMatchObject({
			stale: false,
		});
		expect(send).not.toHaveBeenCalled();
	});

	it("reminds once about a refund processing for 3 days; a younger one waits", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(2),
				finishedAt: hoursAgo(2),
			},
		});
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		for (const age of [73, 50]) {
			const payment = await makePayment({
				studentId: student.id,
				instructorId: instructor.id,
				courseId: course.id,
			});
			await makeRefundRequest({
				paymentId: payment.id,
				studentId: student.id,
				courseId: course.id,
				refundState: "processing",
				createdAt: hoursAgo(age),
			});
		}

		expect(await payoutWatchdogService.check(NOW)).toMatchObject({
			overdueRefunds: 1,
		});
		await payoutWatchdogService.check(new Date(NOW.getTime() + 3600 * 1000));

		expect(templates()).toEqual([
			"admin.refund-overdue",
			"refund.still-processing",
		]);
	});
});
