import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

describe("refund appeal schema (Task 1)", () => {
	let ids: { paymentId: string; studentId: string; courseId: string };

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		});
		ids = { paymentId: payment.id, studentId: student.id, courseId: course.id };
	});

	it("rejects UPDATE and DELETE on an audit row in Postgres (C18)", async () => {
		const row = await testDb.refundAudit.create({
			data: { kind: "exception", paymentId: ids.paymentId, reason: "goodwill" },
		});

		await expect(
			testDb.$executeRaw`UPDATE refund_audit SET reason = 'changed' WHERE id = ${row.id}`,
		).rejects.toThrow(/append-only/);
		await expect(
			testDb.$executeRaw`DELETE FROM refund_audit WHERE id = ${row.id}`,
		).rejects.toThrow(/append-only/);
		expect(
			(await testDb.refundAudit.findUniqueOrThrow({ where: { id: row.id } }))
				.reason,
		).toBe("goodwill");
	});

	it("allows one appeal per request, so one per purchase (FR-S7)", async () => {
		const request = await makeRefundRequest({
			...ids,
			decision: "auto_denied",
			refundState: null,
		});
		await makeAppeal({ requestId: request.id });

		await expect(makeAppeal({ requestId: request.id })).rejects.toMatchObject({
			code: "P2002",
		});
	});

	it("records how a refund was approved, and the direct-appeal decision", async () => {
		const request = await makeRefundRequest({
			...ids,
			decision: "direct_appeal",
			refundState: null,
		});
		const approved = await testDb.refundRequest.update({
			where: { id: request.id },
			data: { approval: "appeal" },
		});

		expect(approved).toMatchObject({
			decision: "direct_appeal",
			approval: "appeal",
		});
	});

	it("backfills approval = automatic for approved requests only (migration statement)", async () => {
		const approved = await makeRefundRequest({
			...ids,
			decision: "auto_approved",
		});
		const other = await makePayment({
			studentId: ids.studentId,
			instructorId: (await makeUser({ role: "INSTRUCTOR" })).id,
			courseId: ids.courseId,
		});
		const denied = await makeRefundRequest({
			...ids,
			paymentId: other.id,
			decision: "auto_denied",
		});

		await testDb.$executeRaw`UPDATE "refund_requests" SET "approval" = 'automatic' WHERE "decision" = 'auto_approved'`;

		const rows = await testDb.refundRequest.findMany({
			where: { id: { in: [approved.id, denied.id] } },
			select: { id: true, approval: true },
		});
		expect(Object.fromEntries(rows.map((r) => [r.id, r.approval]))).toEqual({
			[approved.id]: "automatic",
			[denied.id]: null,
		});
	});
});
