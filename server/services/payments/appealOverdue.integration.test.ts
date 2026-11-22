import { beforeEach, describe, expect, it, vi } from "vitest";
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
const { adminAlertService } = await import("./adminAlert.service");

const DAY = 24 * 60 * 60 * 1000;
const PAID_AT = new Date("2026-11-01T09:00:00.000Z");
const onDay = (day: number) =>
	new Date(PAID_AT.getTime() + day * DAY + 60 * 60 * 1000);

const reminders = () =>
	send.mock.calls.filter(
		([arg]) => arg.templateKey === "admin.appeal-undecided",
	);

describe("day 14: overdue appeals and admin reminders (FR-A4, FR-A5, AC-C11)", () => {
	let studentId: string;
	let instructorId: string;

	const appealFor = async (
		kind: "direct" | "after_denial",
		exceededCondition: string,
		failedConditions: string[] = [exceededCondition],
	) => {
		const course = await makeCourse({ instructorId, title: "Rust" });
		await makeEnrollment({ studentId, courseId: course.id });
		const payment = await makePayment({
			studentId,
			instructorId,
			courseId: course.id,
			paidAt: PAID_AT,
			stripePaymentIntentId: `pi_${Math.random().toString(36).slice(2)}`,
		});
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId: course.id,
			decision: kind === "direct" ? "direct_appeal" : "auto_denied",
			failedConditions,
			createdAt: onDay(12),
		});
		return makeAppeal({
			requestId: request.id,
			kind,
			exceededCondition,
			deadlineAt: onDay(15),
		});
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
		await makeUser({ role: "ADMIN", email: "a1@learnix.test" });
		studentId = (await makeUser()).id;
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
	});

	it("approves an after-denial appeal for the window on day 14, audited overdue, and refunds it", async () => {
		const appeal = await appealFor("after_denial", "window");

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(13)),
		).toBe(0);
		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(14)),
		).toBe(1);

		const stored = await testDb.refundAppeal.findUniqueOrThrow({
			where: { id: appeal.id },
			include: { request: true },
		});
		expect(stored).toMatchObject({
			status: "overdue_approved",
			decidedBy: null,
		});
		expect(stored.request).toMatchObject({
			approval: "overdue",
			refundState: "refunded",
		});
		expect(
			await testDb.refundAudit.findMany({
				select: { kind: true, adminId: true },
			}),
		).toEqual([{ kind: "appeal_overdue", adminId: null }]);
		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(15)),
		).toBe(0);
	});

	it.each([
		["a direct appeal", "direct", "threshold"],
		["an after-denial appeal for the threshold", "after_denial", "threshold"],
		[
			"an after-denial appeal for the account limit",
			"after_denial",
			"account_limit",
		],
	] as const)("leaves %s open after day 14 (T11)", async (_label, kind, condition) => {
		const appeal = await appealFor(kind, condition);

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(20)),
		).toBe(0);
		expect(
			(
				await testDb.refundAppeal.findUniqueOrThrow({
					where: { id: appeal.id },
				})
			).status,
		).toBe("open");
		expect(await testDb.refundAudit.count()).toBe(0);
	});

	it("reminds the admins on days 10 and 13, then daily, once a day", async () => {
		await appealFor("direct", "threshold");

		for (const day of [9, 10, 11, 12, 13, 14, 15]) {
			await adminAlertService.appealUndecided(onDay(day));
			await adminAlertService.appealUndecided(onDay(day));
		}

		expect(reminders()).toHaveLength(4); // days 10, 13, 14, 15
	});

	it("runs the overdue approval inside the daily payout job, before the release", async () => {
		const { payoutJobService } = await import("./payoutJob.service");
		const spy = vi.spyOn(refundAppealAdminService, "approveOverdueAppeals");

		await payoutJobService.run({ trigger: "manual", now: onDay(14) });

		expect(spy).toHaveBeenCalledWith(onDay(14));
	});

	it.each([
		["window + threshold", ["window", "threshold"]],
		["window + account limit", ["window", "account_limit"]],
	])("never auto-approves a late denial that also failed %s (audit H-1, C11)", async (_l, failed) => {
		// The label the old code stored: the first failed condition.
		const appeal = await appealFor("after_denial", "window", failed);

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(20)),
		).toBe(0);
		expect(
			(
				await testDb.refundAppeal.findUniqueOrThrow({
					where: { id: appeal.id },
				})
			).status,
		).toBe("open");
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});

	it.each([
		"certificate",
		"dispute",
	])("does not auto-approve while a %s exists, and leaves the appeal open (audit M-1, EC-10)", async (blocker) => {
		const appeal = await appealFor("after_denial", "window");
		const request = await testDb.refundRequest.findFirstOrThrow({
			where: { appeal: { id: appeal.id } },
		});
		if (blocker === "certificate")
			await testDb.enrollment.updateMany({
				where: { studentId, courseId: request.courseId },
				data: { completedAt: onDay(13) },
			});
		else
			await testDb.payment.update({
				where: { id: request.paymentId },
				data: { disputeState: "open" },
			});

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(14)),
		).toBe(0);
		expect(
			(
				await testDb.refundAppeal.findUniqueOrThrow({
					where: { id: appeal.id },
				})
			).status,
		).toBe("open");
		expect(await testDb.refundAudit.count()).toBe(0);
		expect(stripeMock.refundsCreate).not.toHaveBeenCalled();
	});

	it("is not blocked by older appeals that can never be approved on time (audit L-1)", async () => {
		for (let i = 0; i < 51; i++) await appealFor("direct", "threshold");
		const due = await appealFor("after_denial", "window");

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(14)),
		).toBe(1);
		expect(
			(await testDb.refundAppeal.findUniqueOrThrow({ where: { id: due.id } }))
				.status,
		).toBe("overdue_approved");
	});

	it("never auto-approves an appeal after a denial for an earlier refund of the course (I-8)", async () => {
		const appeal = await appealFor("after_denial", "earlier_refund");

		expect(
			await refundAppealAdminService.approveOverdueAppeals(onDay(20)),
		).toBe(0);
		expect(
			(
				await testDb.refundAppeal.findUniqueOrThrow({
					where: { id: appeal.id },
				})
			).status,
		).toBe("open");
	});
});
