import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { db } from "@/server/db";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const stripeMock = vi.hoisted(() => ({
	refundsCreate: vi.fn(),
	refundsList: vi.fn(),
	piRetrieve: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
	},
}));
const lock = vi.hoisted(() => ({
	acquire: vi.fn(),
	release: vi.fn(),
}));
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => lock,
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue({ id: "em" }) },
}));

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("refundAdmin.refundException (FR-A6, AC-F10, C17, C18)", () => {
	let adminId: string;
	let studentId: string;
	let courseId: string;
	let paymentId: string;

	const exception = (reason = "Course was taken down") =>
		callerFor(adminId, Role.ADMIN).refundAdmin.refundException({
			paymentId,
			reason,
		});

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		lock.acquire.mockResolvedValue("token");
		lock.release.mockResolvedValue(undefined);
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch_1",
				amount: 4900,
				disputed: false,
				refunded: false,
			},
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_x",
			status: "succeeded",
		});
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		studentId = (await makeUser()).id;
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({
			studentId,
			courseId: course.id,
			completedAt: new Date(),
		});
		const payment = await makePayment({
			studentId,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 4900,
			stripePaymentIntentId: "pi_exception",
		});
		courseId = course.id;
		paymentId = payment.id;
	});

	it("refunds with the same effects, revokes the certificate as an exception, and audits once", async () => {
		expect(await exception()).toEqual({ status: "refunded" });

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({ status: "refunded", refundSource: "admin_exception" });
		expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
			{ payment_intent: "pi_exception" },
			{ idempotencyKey: `refund:${paymentId}` },
		);
		const enrollment = await testDb.enrollment.findFirstOrThrow({
			where: { studentId, courseId },
		});
		expect(enrollment.certificateRevokedReason).toBe("admin_exception");
		expect(
			await testDb.refundAudit.findMany({
				select: { kind: true, adminId: true, reason: true },
			}),
		).toEqual([
			{ kind: "exception", adminId, reason: "Course was taken down" },
		]);
	});

	it("does not count for D3 or the account limit (AC-F10)", async () => {
		await exception();

		const counted = await db.$transaction(async (tx) => ({
			d3: await refundRequestRepository.hasCountingRefund(
				tx,
				studentId,
				courseId,
			),
			limit: await refundRequestRepository.countAccountLimitRefunds(
				tx,
				studentId,
				new Date(0),
			),
		}));
		expect(counted).toEqual({ d3: false, limit: 0 });
	});

	it("is a no-op the second time, with no second audit row", async () => {
		await exception();
		expect(await exception()).toEqual({ status: "already_refunded" });
		expect(await testDb.refundAudit.count()).toBe(1);
	});

	it.each([
		Role.STUDENT,
		Role.INSTRUCTOR,
	])("rejects a %s (AC-C17)", async (role) => {
		await expect(
			callerFor(studentId, role).refundAdmin.refundException({
				paymentId,
				reason: "x",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});

	it("rejects an exception without a reason", async () => {
		await expect(exception("   ")).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("refuses while an appeal is open on the payment", async () => {
		const request = await makeRefundRequest({
			paymentId,
			studentId,
			courseId,
			decision: "direct_appeal",
		});
		await makeAppeal({ requestId: request.id, kind: "direct" });

		await expect(exception()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});

	it("refuses while the payout job holds the run lock", async () => {
		lock.acquire.mockResolvedValueOnce(null);

		await expect(exception()).rejects.toMatchObject({ code: "CONFLICT" });
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});
});
