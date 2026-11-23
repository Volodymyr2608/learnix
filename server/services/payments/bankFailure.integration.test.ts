import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrollmentRepository } from "@/server/repositories/enrollment.repository";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makePayment,
	makeUser,
} from "@/test/factories";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { transfers: { listReversals: vi.fn(), createReversal: vi.fn() } },
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { stripeEventService } = await import("./stripeEvent.service");
const { refundEffectsService } = await import(
	"@/server/services/refund/refundEffects.service"
);
const { bankFailureService } = await import(
	"@/server/services/refund/bankFailure.service"
);

const DAY = 24 * 60 * 60 * 1000;

const refundUpdated = (status: string, id = `evt_${status}`): Stripe.Event =>
	({
		id,
		type: "charge.refund.updated",
		data: {
			object: {
				id: "re_1",
				object: "refund",
				status,
				payment_intent: "pi_bank",
				charge: "ch_1",
			},
		},
	}) as unknown as Stripe.Event;

const sent = (templateKey: string) =>
	send.mock.calls.filter(([a]) => a.templateKey === templateKey);

describe("a refund that failed at the bank (FR-P27, FS-3, AC-F17)", () => {
	let studentId: string;
	let courseId: string;
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em" });
		await makeUser({ role: "ADMIN" });
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			transferStatus: "pending",
			paidAt: new Date(Date.now() - 2 * DAY),
			stripePaymentIntentId: "pi_bank",
		});
		studentId = student.id;
		courseId = course.id;
		paymentId = payment.id;
		await refundEffectsService.apply({
			paymentId,
			path: "dashboard_refund",
			now: new Date(),
		});
		send.mockClear();
	});

	it("restores access, holds the share again, and keeps it out of release", async () => {
		await stripeEventService.handle(refundUpdated("failed"), new Date());

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({ transferStatus: "pending" });
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }))
				.bankFailureAt,
		).not.toBeNull();
		expect(
			(
				await testDb.enrollment.findFirstOrThrow({
					where: { studentId, courseId },
				})
			).status,
		).toBe("active");
		expect(
			await payoutRepository.claimForRelease(
				paymentId,
				new Date(Date.now() + 30 * DAY),
			),
		).toBe(false);
	});

	it("tells the student and the admins once, even on a replayed event", async () => {
		await stripeEventService.handle(refundUpdated("failed"), new Date());
		await stripeEventService.handle(
			refundUpdated("failed", "evt_again"),
			new Date(),
		);

		expect(sent("refund.bank-failed")).toHaveLength(1);
		expect(sent("admin.bank-failure")).toHaveLength(1);
		expect(sent("refund.bank-failed")[0]?.[0].payload.body).toMatch(/access/i);
	});

	it("does nothing for a refund update that did not fail", async () => {
		await stripeEventService.handle(refundUpdated("succeeded"), new Date());

		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }))
				.bankFailureAt,
		).toBeNull();
		expect(send).not.toHaveBeenCalled();
	});

	it("a restore that fails is done by the redelivered event (C8, qa F2)", async () => {
		const restore = vi
			.spyOn(enrollmentRepository, "reactivateCancelledInTx")
			.mockRejectedValueOnce(new Error("pool timeout"));

		await expect(
			stripeEventService.handle(refundUpdated("failed"), new Date()),
		).rejects.toThrow("pool timeout");
		await stripeEventService.handle(
			refundUpdated("failed", "evt_redelivered"),
			new Date(),
		);
		restore.mockRestore();

		expect(
			(
				await testDb.enrollment.findFirstOrThrow({
					where: { studentId, courseId },
				})
			).status,
		).toBe("active");
		expect(sent("refund.bank-failed")).toHaveLength(1);
	});

	it("a redelivered failure of the same refund does not reopen a closed case (qa F5)", async () => {
		await stripeEventService.handle(refundUpdated("failed"), new Date());
		const admin = await testDb.user.findFirstOrThrow({
			where: { role: "ADMIN" },
		});
		await bankFailureService.resolve(admin.id, {
			paymentId,
			outcome: "refunded_elsewhere",
			note: "Bank transfer sent",
		});

		await stripeEventService.handle(
			refundUpdated("failed", "evt_retry"),
			new Date(),
		);

		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({ bankFailureAt: null, transferStatus: "cancelled" });
	});
});
