import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeConversation,
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

describe("refund effects schema", () => {
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

	it("stores a request's refund state, Stripe refund id and error (R1)", async () => {
		const payment = await makePayment(ids);
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
			refundError: "Stripe timeout",
		});
		const updated = await testDb.refundRequest.update({
			where: { id: request.id },
			data: {
				refundState: "refunded",
				stripeRefundId: "re_1",
				refundedAt: new Date(),
			},
		});
		expect(updated).toMatchObject({
			refundState: "refunded",
			stripeRefundId: "re_1",
			refundError: "Stripe timeout",
		});
	});

	it("stores a certificate revocation on the enrollment (R4)", async () => {
		const enrollment = await makeEnrollment({
			studentId: ids.studentId,
			courseId: ids.courseId,
		});
		const revoked = await testDb.enrollment.update({
			where: { id: enrollment.id },
			data: {
				certificateRevokedAt: new Date(),
				certificateRevokedReason: "dashboard_refund",
			},
		});
		expect(revoked.certificateRevokedReason).toBe("dashboard_refund");
	});

	it("closes a conversation", async () => {
		const conversation = await makeConversation(ids);
		const closed = await testDb.conversation.update({
			where: { id: conversation.id },
			data: { closedAt: new Date() },
		});
		expect(closed.closedAt).toBeInstanceOf(Date);
	});

	it("keeps one study-archive row per student and day", async () => {
		const day = new Date("2026-11-20T00:00:00.000Z");
		await testDb.studyArchive.create({
			data: { studentId: ids.studentId, day, minutes: 30, lessons: 2 },
		});
		await expect(
			testDb.studyArchive.create({
				data: { studentId: ids.studentId, day, minutes: 5, lessons: 1 },
			}),
		).rejects.toMatchObject({ code: "P2002" });
	});

	it("stores the replay cursor and the run's refund counts", async () => {
		await testDb.stripeReplayCursor.create({
			data: { id: "charge.refunded", lastEventCreated: 1_763_000_000 },
		});
		const run = await testDb.payoutRun.create({
			data: { trigger: "cron", refundsRetried: 2, eventsReplayed: 3 },
		});
		expect(run).toMatchObject({ refundsRetried: 2, eventsReplayed: 3 });
	});

	it("truncateAll empties the new tables", async () => {
		await testDb.studyArchive.create({
			data: {
				studentId: ids.studentId,
				day: new Date(),
				minutes: 1,
				lessons: 1,
			},
		});
		await testDb.stripeReplayCursor.create({
			data: { id: "x", lastEventCreated: 1 },
		});
		await truncateAll();
		expect(await testDb.studyArchive.count()).toBe(0);
		expect(await testDb.stripeReplayCursor.count()).toBe(0);
	});
});
