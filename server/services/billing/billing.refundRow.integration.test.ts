import { beforeEach, describe, expect, it, vi } from "vitest";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { billingService } from "@/server/services/billing/billing.service";
import { truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("@/server/services/refund/refundFlag", () => ({
	isStudentRefundEnabled: () => flag.on,
}));

const DAY = 24 * 60 * 60 * 1000;
const recent = () => new Date(Date.now() - DAY);

describe("billingService.listPurchases — the refund row state (U7, AC-F1)", () => {
	let instructorId: string;
	let studentId: string;

	const purchase = async (
		overrides: Parameters<typeof makePayment>[0] extends infer T
			? Partial<T>
			: never = {},
	) => {
		const course = await makeCourse({ instructorId });
		await makeEnrollment({ studentId, courseId: course.id });
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			paidAt: recent(),
			...overrides,
		});
		return { course, payment };
	};

	const rowFor = async (paymentId: string) =>
		(await billingService.listPurchases(studentId)).find(
			(p) => p.paymentId === paymentId,
		)?.refund;

	beforeEach(async () => {
		flag.on = true;
		await truncateAll();
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
		studentId = (await makeUser()).id;
	});

	it("is null on every row with the flag off", async () => {
		await purchase();
		flag.on = false;

		const rows = await billingService.listPurchases(studentId);

		expect(rows.map((r) => r.refund)).toEqual([null]);
	});

	it("offers the action inside the window", async () => {
		const { payment } = await purchase();

		expect(await rowFor(payment.id)).toMatchObject({ kind: "request" });
	});

	it("shows nothing once the window closed", async () => {
		const { payment } = await purchase({
			paidAt: new Date(Date.now() - 15 * DAY),
		});

		expect(await rowFor(payment.id)).toEqual({ kind: "none" });
	});

	it("shows nothing after a certificate", async () => {
		const course = await makeCourse({ instructorId });
		await makeEnrollment({
			studentId,
			courseId: course.id,
			completedAt: new Date(),
		});
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			paidAt: recent(),
		});

		expect(await rowFor(payment.id)).toEqual({ kind: "none" });
	});

	it("shows nothing with an open dispute", async () => {
		const { payment } = await purchase({ disputeState: "open" });

		expect(await rowFor(payment.id)).toEqual({ kind: "none" });
	});

	it("shows nothing on a repurchase after a counting refund of the course", async () => {
		const { course, payment: first } = await purchase({
			status: "refunded",
			refundedAt: recent(),
		});
		await makeRefundRequest({
			paymentId: first.id,
			studentId,
			courseId: course.id,
			decision: "auto_approved",
			refundState: "refunded",
		});
		const again = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			paidAt: recent(),
		});

		expect(await rowFor(first.id)).toEqual({
			kind: "status",
			status: "refunded",
		});
		expect(await rowFor(again.id)).toEqual({ kind: "none" });
	});

	it.each([
		["processing", "auto_approved", "processing"],
		["denied", "auto_denied", null],
	] as const)("shows the %s status", async (status, decision, refundState) => {
		const { course, payment } = await purchase();
		await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision,
			refundState,
		});

		expect(await rowFor(payment.id)).toEqual({ kind: "status", status });
	});

	it("reads the same number of times for one purchase and for five (no N+1)", async () => {
		const spies = [
			vi.spyOn(paymentRepository, "findPurchasesByStudent"),
			vi.spyOn(refundRequestRepository, "findCertifiedCourseIds"),
			vi.spyOn(refundRequestRepository, "findCountingRefundCourseIds"),
		];
		await purchase();
		await billingService.listPurchases(studentId);
		const callsForOne = spies.map((s) => s.mock.calls.length);
		for (const s of spies) s.mockClear();

		for (let i = 0; i < 4; i++) await purchase();
		await billingService.listPurchases(studentId);

		expect(spies.map((s) => s.mock.calls.length)).toEqual(callsForOne);
		expect(callsForOne).toEqual([1, 1, 1]);
	});
});
