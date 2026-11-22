import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => true,
}));

const YEAR_AGO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

describe("counting follows how a refund was approved (V2)", () => {
	let studentId: string;
	let instructorId: string;

	const refunded = async (
		approval: "automatic" | "appeal" | "overdue" | null,
		decision:
			| "auto_approved"
			| "auto_denied"
			| "direct_appeal" = "auto_approved",
	) => {
		const course = await makeCourse({ instructorId });
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			status: "refunded",
			refundedAt: new Date(),
		});
		await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision,
			approval,
			refundState: approval ? "refunded" : null,
		});
		return course.id;
	};

	const counts = (courseId: string) =>
		db.$transaction(async (tx) => ({
			d3: await refundRequestRepository.hasCountingRefund(
				tx,
				studentId,
				courseId,
			),
			accountLimit: await refundRequestRepository.countAccountLimitRefunds(
				tx,
				studentId,
				YEAR_AGO,
			),
		}));

	beforeEach(async () => {
		await truncateAll();
		studentId = (await makeUser()).id;
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
	});

	it("counts an automatic refund for D3 and the account limit", async () => {
		const courseId = await refunded("automatic");
		expect(await counts(courseId)).toEqual({ d3: true, accountLimit: 1 });
	});

	it.each([
		["appeal", "auto_denied"],
		["overdue", "auto_denied"],
		["appeal", "direct_appeal"],
	] as const)("counts an %s approval (%s) for D3 only", async (approval, decision) => {
		const courseId = await refunded(approval, decision);
		expect(await counts(courseId)).toEqual({ d3: true, accountLimit: 0 });
	});

	it("does not count a denied request with no approval", async () => {
		const courseId = await refunded(null, "auto_denied");
		expect(await counts(courseId)).toEqual({ d3: false, accountLimit: 0 });
	});

	it("does not count an exception (no request row) for either (AC-F10)", async () => {
		const course = await makeCourse({ instructorId });
		await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			status: "refunded",
			refundSource: "admin_exception",
			refundedAt: new Date(),
		});
		expect(await counts(course.id)).toEqual({ d3: false, accountLimit: 0 });
	});

	it("lists an appeal-approved course among the counting courses for the purchases list", async () => {
		const courseId = await refunded("appeal", "auto_denied");
		expect(
			await refundRequestRepository.findCountingRefundCourseIds(studentId, [
				courseId,
			]),
		).toEqual(new Set([courseId]));
	});

	it("writes approval = automatic on an automatic approval", async () => {
		const course = await makeCourse({ instructorId });
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
		});
		const { refundService } = await import(
			"@/server/services/refund/refund.service"
		);
		vi.spyOn(refundService, "executeRefund").mockResolvedValue("processing");

		const result = await refundService.requestRefund(studentId, {
			paymentId: payment.id,
			reason: "too_easy",
		});

		expect(
			(
				await testDb.refundRequest.findUniqueOrThrow({
					where: { id: result.requestId },
				})
			).approval,
		).toBe("automatic");
	});
});
