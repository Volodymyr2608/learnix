import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeInstructorProfile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const stripeMock = vi.hoisted(() => ({
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
	transfersList: vi.fn(),
	transfersCreate: vi.fn(),
	listReversals: vi.fn(),
	createReversal: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		accounts: { retrieve: async () => ({ payouts_enabled: true }) },
		transfers: {
			list: stripeMock.transfersList,
			create: stripeMock.transfersCreate,
			listReversals: stripeMock.listReversals,
			createReversal: stripeMock.createReversal,
		},
	},
}));
const lock = vi.hoisted(() => ({
	acquire: vi.fn(async () => "token" as string | null),
	release: vi.fn(async () => undefined),
}));
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => lock,
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("admin payout procedures (AC-F11, C17)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };
	let adminId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		lock.acquire.mockResolvedValue("token");
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		await makeInstructorProfile({
			userId: instructor.id,
			stripeAccountId: "acct_1",
			stripePayoutsEnabled: true,
		});
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch_1",
				amount: 4999,
				refunded: false,
				disputed: false,
			},
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_1",
			status: "succeeded",
		});
		stripeMock.transfersList.mockResolvedValue({ data: [] });
		stripeMock.transfersCreate.mockResolvedValue({ id: "tr_1" });
		stripeMock.listReversals.mockResolvedValue({ data: [] });
		stripeMock.createReversal.mockResolvedValue({ id: "trr_1" });
	});

	it.each([
		Role.STUDENT,
		Role.INSTRUCTOR,
	])("rejects a %s on every payout procedure and changes nothing", async (role) => {
		const user = await makeUser({ role });
		const payment = await makePayment({
			...ids,
			transferStatus: "transferring",
		});
		const caller = callerFor(user.id, role).payment;

		for (const call of [
			() => caller.getPayoutStatus(),
			() => caller.retryRefund({ requestId: "req_x" }),
			() => caller.retryRelease({ paymentId: payment.id }),
			() => caller.retryReversal({ paymentId: payment.id }),
		]) {
			await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }))
				.transferStatus,
		).toBe("transferring");
	});

	it("returns the panel to an admin", async () => {
		const status = await callerFor(
			adminId,
			Role.ADMIN,
		).payment.getPayoutStatus();

		expect(status).toMatchObject({
			lastRun: null,
			heldFunds: { count: 0, totalCents: 0, dueSoonCents: 0 },
			problems: {
				overdueRefunds: [],
				stuckTransfers: [],
				pendingReversals: [],
			},
		});
	});

	it("retries an overdue refund", async () => {
		const payment = await makePayment({
			...ids,
			transferStatus: "pending",
			stripePaymentIntentId: "pi_1",
		});
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
		});

		const result = await callerFor(adminId, Role.ADMIN).payment.retryRefund({
			requestId: request.id,
		});

		expect(result).toEqual({ status: "refunded" });
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }))
				.status,
		).toBe("refunded");
	});

	it("retries a stuck transfer for that payment only, without a run row", async () => {
		const stuck = await makePayment({
			...ids,
			transferStatus: "transferring",
			stripePaymentIntentId: "pi_2",
		});

		const result = await callerFor(adminId, Role.ADMIN).payment.retryRelease({
			paymentId: stuck.id,
		});

		expect(result).toEqual({ outcome: "released" });
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: stuck.id } }))
				.transferStatus,
		).toBe("transferred");
		expect(await testDb.payoutRun.count()).toBe(0);
	});

	it("retries a pending reversal", async () => {
		const payment = await makePayment({
			...ids,
			status: "refunded",
			refundedAt: new Date(),
			transferStatus: "transferred",
			stripeTransferId: "tr_9",
		});

		const result = await callerFor(adminId, Role.ADMIN).payment.retryReversal({
			paymentId: payment.id,
		});

		expect(result).toEqual({ outcome: "reversed" });
		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }))
				.transferStatus,
		).toBe("reversed");
	});

	it("refuses to reverse a payment that does not need it", async () => {
		const payment = await makePayment({
			...ids,
			transferStatus: "transferred",
			stripeTransferId: "tr_8",
		});

		await expect(
			callerFor(adminId, Role.ADMIN).payment.retryReversal({
				paymentId: payment.id,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(stripeMock.createReversal).not.toHaveBeenCalled();
	});

	it.each([
		"retryRelease",
		"retryReversal",
	] as const)("%s waits for the payout run: CONFLICT while it holds the lock, no Stripe call (audit L1)", async (procedure) => {
		const payment = await makePayment({
			...ids,
			status: "refunded",
			refundedAt: new Date(),
			transferStatus: "transferred",
			stripeTransferId: "tr_7",
		});
		lock.acquire.mockResolvedValue(null);

		await expect(
			callerFor(adminId, Role.ADMIN).payment[procedure]({
				paymentId: payment.id,
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(stripeMock.createReversal).not.toHaveBeenCalled();
		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
	});

	it("answers NOT_FOUND for a refund request that does not exist (review I2)", async () => {
		await expect(
			callerFor(adminId, Role.ADMIN).payment.retryRefund({
				requestId: "req_missing",
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
