import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makePayment, makeUser } from "@/test/factories";

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
