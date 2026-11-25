import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue({ id: "em" }) },
}));

const DAY = 24 * 60 * 60 * 1000;

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("the admin closes a bank failure (FR-P27, AC-F17, C17, C18)", () => {
	let adminId: string;
	let studentId: string;
	let paymentId: string;

	const admin = () => callerFor(adminId, Role.ADMIN).refundAdmin;
	const payment = () =>
		testDb.payment.findUniqueOrThrow({ where: { id: paymentId } });

	beforeEach(async () => {
		await truncateAll();
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		studentId = (await makeUser()).id;
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust",
		});
		paymentId = (
			await makePayment({
				studentId,
				instructorId: instructor.id,
				courseId: course.id,
				status: "refunded",
				refundedAt: new Date(),
				refundSource: "dashboard_refund",
				transferStatus: "pending",
				bankFailureAt: new Date(),
				paidAt: new Date(Date.now() - 3 * DAY),
			})
		).id;
	});

	it("lists open bank failures for admins", async () => {
		const list = await admin().listBankFailures();
		expect(list).toMatchObject([{ paymentId, courseTitle: "Rust" }]);
	});

	it("'refunded another way' cancels the share and audits it once", async () => {
		await admin().resolveBankFailure({
			paymentId,
			outcome: "refunded_elsewhere",
			note: "Bank transfer sent",
		});

		expect(await payment()).toMatchObject({
			status: "refunded",
			transferStatus: "cancelled",
			bankFailureAt: null,
		});
		expect(
			await testDb.refundAudit.findMany({
				select: { kind: true, adminId: true, reason: true },
			}),
		).toEqual([
			{
				kind: "bank_failure_refunded_elsewhere",
				adminId,
				reason: "Bank transfer sent",
			},
		]);
		expect(await admin().listBankFailures()).toEqual([]);
	});

	it("'the sale stands' restores the payment and lets the share follow the release rule", async () => {
		await admin().resolveBankFailure({
			paymentId,
			outcome: "sale_stands",
			note: "Student agreed to keep the course",
		});

		expect(await payment()).toMatchObject({
			status: "succeeded",
			refundedAt: null,
			refundSource: null,
			transferStatus: "pending",
			bankFailureAt: null,
		});
		expect(await testDb.refundAudit.count()).toBe(1);
		expect(
			await payoutRepository.claimForRelease(
				paymentId,
				new Date(Date.now() + 30 * DAY),
			),
		).toBe(true);
	});

	it("refuses a second resolution", async () => {
		await admin().resolveBankFailure({
			paymentId,
			outcome: "sale_stands",
			note: "ok",
		});
		await expect(
			admin().resolveBankFailure({
				paymentId,
				outcome: "refunded_elsewhere",
				note: "x",
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await testDb.refundAudit.count()).toBe(1);
	});

	it("rejects a missing note", async () => {
		await expect(
			admin().resolveBankFailure({
				paymentId,
				outcome: "sale_stands",
				note: "  ",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it.each([
		Role.STUDENT,
		Role.INSTRUCTOR,
	])("rejects a %s (C17)", async (role) => {
		const caller = callerFor(studentId, role).refundAdmin;
		await expect(caller.listBankFailures()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.resolveBankFailure({
				paymentId,
				outcome: "sale_stands",
				note: "x",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("the bank-failure outcomes keep money and access consistent (qa #1, #4, F3)", () => {
	let adminId: string;
	let studentId: string;
	let instructorId: string;
	let courseId: string;

	const admin = () => callerFor(adminId, Role.ADMIN).refundAdmin;

	const failedRefund = async (
		overrides: Partial<Parameters<typeof makePayment>[0]> = {},
	) =>
		makePayment({
			studentId,
			instructorId,
			courseId,
			status: "refunded",
			refundedAt: new Date(),
			refundSource: "refund_request",
			transferStatus: "pending",
			bankFailureAt: new Date(),
			paidAt: new Date(Date.now() - 3 * DAY),
			...overrides,
		});

	beforeEach(async () => {
		await truncateAll();
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		instructorId = (await makeUser({ role: Role.INSTRUCTOR })).id;
		studentId = (await makeUser()).id;
		courseId = (await makeCourse({ instructorId })).id;
	});

	it("'the sale stands' on a student's request reverses the request: released, and it no longer counts", async () => {
		const payment = await failedRefund();
		await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId,
			refundState: "refunded",
			refundedAt: new Date(),
		});

		await admin().resolveBankFailure({
			paymentId: payment.id,
			outcome: "sale_stands",
			note: "Card closed; student keeps the course",
		});

		expect(
			await testDb.refundRequest.findUniqueOrThrow({
				where: { paymentId: payment.id },
			}),
		).toMatchObject({ refundState: "reversed" });
		expect(
			await payoutRepository.claimForRelease(
				payment.id,
				new Date(Date.now() + 30 * DAY),
			),
		).toBe(true);
		expect(
			await refundRequestRepository.findCountingRefundCourseIds(studentId, [
				courseId,
			]),
		).toEqual(new Set());
	});

	it("'refunded another way' takes the restored access away again", async () => {
		const payment = await failedRefund();
		await makeEnrollment({ studentId, courseId, status: "active" });

		await admin().resolveBankFailure({
			paymentId: payment.id,
			outcome: "refunded_elsewhere",
			note: "Bank transfer sent",
		});

		expect(
			(
				await testDb.enrollment.findFirstOrThrow({
					where: { studentId, courseId },
				})
			).status,
		).toBe("cancelled");
	});

	it("refuses 'the sale stands' for a double charge (AC-C13)", async () => {
		const payment = await failedRefund({
			refundSource: "duplicate_charge",
			transferStatus: "none",
		});

		await expect(
			admin().resolveBankFailure({
				paymentId: payment.id,
				outcome: "sale_stands",
				note: "x",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }),
		).toMatchObject({ transferStatus: "none" });
		expect(await testDb.refundAudit.count()).toBe(0);
	});

	it.each([
		["sale_stands", "reversed"],
		["refunded_elsewhere", "transferred"],
	] as const)("'%s' leaves a %s share alone", async (outcome, transferStatus) => {
		const payment = await failedRefund({ transferStatus });

		await admin().resolveBankFailure({
			paymentId: payment.id,
			outcome,
			note: "x",
		});

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }),
		).toMatchObject({ transferStatus, bankFailureAt: null });
	});
});
