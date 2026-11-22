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

const { adminAlertService } = await import("./adminAlert.service");

const NOW = new Date("2026-11-20T10:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

describe("adminAlertService (FR-A10, FR-A11, M4–M6)", () => {
	beforeEach(async () => {
		await truncateAll();
		send.mockReset();
		send.mockResolvedValue({ id: "em_1" });
		await makeUser({ role: "ADMIN", email: "a1@learnix.test" });
		await makeUser({ role: "ADMIN", email: "a2@learnix.test" });
	});

	it("emails every admin once per failed run", async () => {
		const run = await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(1),
				finishedAt: NOW,
				error: "connection lost",
			},
		});

		await adminAlertService.runFailed(run);
		await adminAlertService.runFailed(run);

		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls.map((c) => c[0].toEmail).sort()).toEqual([
			"a1@learnix.test",
			"a2@learnix.test",
		]);
		expect(send.mock.calls[0]?.[0]).toMatchObject({
			templateKey: "admin.payout-run-failed",
			payload: expect.objectContaining({ error: "connection lost" }),
		});
	});

	it("retries an alert whose send failed (M5)", async () => {
		const run = await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(1),
				finishedAt: NOW,
				error: "x",
			},
		});
		send.mockRejectedValueOnce(new Error("resend down"));

		await adminAlertService.runFailed(run);
		await adminAlertService.runFailed(run);

		expect(send).toHaveBeenCalledTimes(3); // a1 failed, a2 sent; then a1 again
	});

	it("alerts after 48 h without a successful run, once a day", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(49),
				finishedAt: hoursAgo(49),
			},
		});

		expect(await adminAlertService.checkStale(NOW)).toBe(true);
		await adminAlertService.checkStale(NOW);

		expect(send).toHaveBeenCalledTimes(2);
		expect(send.mock.calls[0]?.[0].templateKey).toBe("admin.payout-stale");
	});

	it("does not alert within 48 h of a success", async () => {
		await testDb.payoutRun.create({
			data: {
				trigger: "cron",
				startedAt: hoursAgo(47),
				finishedAt: hoursAgo(47),
			},
		});

		expect(await adminAlertService.checkStale(NOW)).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it("alerts when no run ever succeeded while money is held", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
			paidAt: hoursAgo(24 * 20),
		});

		expect(await adminAlertService.checkStale(NOW)).toBe(true);
	});

	it("sends the day-3 reminders once: admins and the student, with no error text (FR-A11, C23)", async () => {
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser({
			email: "student@learnix.test",
			name: "Ada",
		});
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Intro to RAG",
		});
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: student.id,
			courseId: course.id,
			refundState: "processing",
			refundError: "Your card was declined",
			createdAt: hoursAgo(80),
		});

		await adminAlertService.refundOverdue(request.id);
		await adminAlertService.refundOverdue(request.id);

		const templates = send.mock.calls.map((c) => c[0].templateKey).sort();
		expect(templates).toEqual([
			"admin.refund-overdue",
			"admin.refund-overdue",
			"refund.still-processing",
		]);
		const studentCall = send.mock.calls.find(
			(c) => c[0].templateKey === "refund.still-processing",
		);
		expect(studentCall?.[0]).toMatchObject({
			toEmail: "student@learnix.test",
			payload: { name: "Ada", courseTitle: "Intro to RAG" },
		});
		expect(JSON.stringify(studentCall)).not.toContain("declined");
	});
});
