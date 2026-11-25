import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeEnrollment,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));
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
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { refundAppealAdminService } = await import(
	"@/server/services/refund/refundAppealAdmin.service"
);
const { refundNotificationsService } = await import(
	"@/server/services/refund/refundNotifications.service"
);

const DAY = 24 * 60 * 60 * 1000;

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

const decidedEmails = () =>
	send.mock.calls.filter(
		([arg]) => arg.templateKey === "refund.appeal-decided",
	);

describe("admin appeal decisions (FR-A1–A3, AC-F8, AC-C17, AC-C18)", () => {
	let adminId: string;
	let student: { id: string; email: string };
	let ids: { paymentId: string; courseId: string; instructorId: string };
	let appealId: string;

	const seedAppeal = async (paidAt = new Date(Date.now() - 2 * DAY)) => {
		const course = await makeCourse({
			instructorId: ids.instructorId,
			title: "Rust",
		});
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: ids.instructorId,
			courseId: course.id,
			amountCents: 4900,
			paidAt,
			stripePaymentIntentId: `pi_${Math.random().toString(36).slice(2)}`,
		});
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: student.id,
			courseId: course.id,
			decision: "direct_appeal",
			failedConditions: ["threshold"],
			snapshot: { openedCount: 4, lessonCount: 6, threshold: 3 },
		});
		const appeal = await makeAppeal({
			requestId: request.id,
			kind: "direct",
			exceededCondition: "threshold",
			deadlineAt: new Date(paidAt.getTime() + 14 * DAY),
		});
		ids = { ...ids, paymentId: payment.id, courseId: course.id };
		return appeal;
	};

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em_1" });
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
			id: "re_1",
			status: "succeeded",
		});
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		student = await makeUser({ name: "Ada" });
		ids = {
			paymentId: "",
			courseId: "",
			instructorId: (await makeUser({ role: Role.INSTRUCTOR })).id,
		};
		appealId = (await seedAppeal()).id;
	});

	it.each([
		Role.STUDENT,
		Role.INSTRUCTOR,
	])("rejects a %s on every admin procedure (AC-C17)", async (role) => {
		const caller = callerFor(student.id, role);
		await expect(caller.refundAdmin.listOpenAppeals()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			caller.refundAdmin.approveAppeal({ appealId }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(await testDb.refundAudit.count()).toBe(0);
	});

	it("lists open appeals oldest first with the snapshot, days left and what blocks approval (FR-A1)", async () => {
		const older = await testDb.refundAppeal.update({
			where: { id: appealId },
			data: { createdAt: new Date(Date.now() - DAY) },
		});
		const newer = await seedAppeal();

		const queue = await callerFor(
			adminId,
			Role.ADMIN,
		).refundAdmin.listOpenAppeals();

		expect(queue.map((a) => a.appealId)).toEqual([older.id, newer.id]);
		expect(queue[0]).toMatchObject({
			courseTitle: "Rust",
			kind: "direct",
			exceededCondition: "threshold",
			reason: "other",
			daysLeft: 12,
			approveBlockedBy: null,
			snapshot: { openedCount: 4, lessonCount: 6, threshold: 3 },
		});
	});

	it("approves: refunds once, writes exactly one audit row, emails the student (AC-C18)", async () => {
		const result = await callerFor(
			adminId,
			Role.ADMIN,
		).refundAdmin.approveAppeal({
			appealId,
		});

		expect(result).toEqual({ refundStatus: "refunded" });
		const appeal = await testDb.refundAppeal.findUniqueOrThrow({
			where: { id: appealId },
			include: { request: true },
		});
		expect(appeal).toMatchObject({ status: "approved", decidedBy: adminId });
		expect(appeal.request).toMatchObject({
			approval: "appeal",
			refundState: "refunded",
		});
		expect(stripeMock.refundsCreate).toHaveBeenCalledTimes(1);
		expect(
			await testDb.refundAudit.findMany({
				select: { kind: true, adminId: true },
			}),
		).toEqual([{ kind: "appeal_approved", adminId }]);
		expect(decidedEmails()).toHaveLength(1);
	});

	it.each([
		[
			"certificate",
			async () => {
				await testDb.enrollment.updateMany({
					where: { studentId: student.id, courseId: ids.courseId },
					data: { completedAt: new Date() },
				});
			},
		],
		[
			"dispute",
			async () => {
				await testDb.payment.update({
					where: { id: ids.paymentId },
					data: { disputeState: "open" },
				});
			},
		],
	] as const)("refuses to approve with a %s and says why (AC-F8)", async (blocker, arrange) => {
		await arrange();

		const queue = await callerFor(
			adminId,
			Role.ADMIN,
		).refundAdmin.listOpenAppeals();
		expect(queue[0]?.approveBlockedBy).toBe(blocker);
		await expect(
			callerFor(adminId, Role.ADMIN).refundAdmin.approveAppeal({ appealId }),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
		expect(await testDb.refundAudit.count()).toBe(0);
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});

	it("denies with a reason and admin files, once, with one audit row (FR-A2, FR-A3)", async () => {
		await refundAppealAdminService.denyAppeal(adminId, appealId, {
			reason: "The course matches its description.",
			files: [],
		});

		expect(
			await testDb.refundAppeal.findUniqueOrThrow({ where: { id: appealId } }),
		).toMatchObject({
			status: "denied",
			denialReason: "The course matches its description.",
			decidedBy: adminId,
		});
		expect(await testDb.refundAudit.count()).toBe(1);
		expect(decidedEmails()).toHaveLength(1);
		expect(decidedEmails()[0]?.[0].payload.body).toContain(
			"The course matches its description.",
		);
	});

	it("rejects a denial without a reason", async () => {
		await expect(
			refundAppealAdminService.denyAppeal(adminId, appealId, {
				reason: "  ",
				files: [],
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("refuses a second decision (FR-A3)", async () => {
		await refundAppealAdminService.denyAppeal(adminId, appealId, {
			reason: "No.",
			files: [],
		});

		await expect(
			callerFor(adminId, Role.ADMIN).refundAdmin.approveAppeal({ appealId }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			refundAppealAdminService.denyAppeal(adminId, appealId, {
				reason: "No.",
				files: [],
			}),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(await testDb.refundAudit.count()).toBe(1);
	});

	it("re-sends a decision email whose send failed, once (resend sweep)", async () => {
		send.mockRejectedValueOnce(new Error("resend down"));
		await refundAppealAdminService.denyAppeal(adminId, appealId, {
			reason: "No.",
			files: [],
		});

		await refundNotificationsService.resendMissing(new Date());
		await refundNotificationsService.resendMissing(new Date());

		expect(decidedEmails()).toHaveLength(2);
	});

	it("starts the 3-day clock at the approval, not at the original filing (review I1)", async () => {
		stripeMock.refundsCreate.mockRejectedValueOnce(new Error("Stripe 500"));
		await testDb.refundRequest.updateMany({
			data: { createdAt: new Date(Date.now() - 10 * DAY) },
		});

		await callerFor(adminId, Role.ADMIN).refundAdmin.approveAppeal({
			appealId,
		});

		const request = await testDb.refundRequest.findFirstOrThrow({
			where: { paymentId: ids.paymentId },
		});
		expect(request.refundState).toBe("processing");
		expect(Date.now() - (request.approvedAt?.getTime() ?? 0)).toBeLessThan(
			60_000,
		);
		const { refundRequestRepository } = await import(
			"@/server/repositories/refundRequest.repository"
		);
		expect(
			await refundRequestRepository.findOverdueIds(
				new Date(Date.now() - 3 * DAY),
				10,
			),
		).toEqual([]);
	});

	it.each([
		"dashboard_refund",
		"lost_dispute",
		"admin_exception",
	] as const)("closes an open appeal when the payment is refunded by %s, with nothing left to decide (review I2)", async (path) => {
		const { refundEffectsService } = await import(
			"@/server/services/refund/refundEffects.service"
		);

		await refundEffectsService.apply({
			paymentId: ids.paymentId,
			path,
			now: new Date(),
		});

		expect(
			(await testDb.refundAppeal.findUniqueOrThrow({ where: { id: appealId } }))
				.status,
		).toBe("closed_refunded");
		expect(
			await callerFor(adminId, Role.ADMIN).refundAdmin.listOpenAppeals(),
		).toEqual([]);
		await expect(
			callerFor(adminId, Role.ADMIN).refundAdmin.approveAppeal({ appealId }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(
			(
				await testDb.refundRequest.findFirstOrThrow({
					where: { paymentId: ids.paymentId },
				})
			).approval,
		).toBeNull();
	});

	it("counts days left to day 14 of the payment, not to the filing deadline (review I5)", async () => {
		await testDb.refundAppeal.update({
			where: { id: appealId },
			data: { deadlineAt: new Date(Date.now() + 20 * DAY) },
		});

		const queue = await callerFor(
			adminId,
			Role.ADMIN,
		).refundAdmin.listOpenAppeals();

		expect(queue[0]?.daysLeft).toBe(12);
	});
});
