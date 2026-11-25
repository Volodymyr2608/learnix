import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import {
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
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { transfers: { listReversals: vi.fn(), createReversal: vi.fn() } },
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { stripeEventService } = await import("./stripeEvent.service");

const charge = (amountRefunded: number, id = "evt_r"): Stripe.Event =>
	({
		id,
		type: "charge.refunded",
		data: {
			object: {
				id: "ch_1",
				amount: 4900,
				amount_refunded: amountRefunded,
				payment_intent: "pi_1",
			},
		},
	}) as unknown as Stripe.Event;

const disputeLost = (created = 1_763_000_000): Stripe.Event =>
	({
		id: `evt_lost_${created}`,
		type: "charge.dispute.closed",
		created,
		data: {
			object: {
				id: "dp_1",
				status: "lost",
				payment_intent: "pi_1",
				charge: "ch_1",
			},
		},
	}) as unknown as Stripe.Event;

const sent = (templateKey: string) =>
	send.mock.calls.filter(([arg]) => arg.templateKey === templateKey);

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("Dashboard refunds and lost disputes are reported (FR-A7, AC-F21)", () => {
	let adminId: string;
	let student: { id: string };
	let ids: { paymentId: string; courseId: string };

	const needsReview = async () =>
		(await testDb.payment.findUniqueOrThrow({ where: { id: ids.paymentId } }))
			.needsReviewAt;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em_1" });
		adminId = (await makeUser({ role: Role.ADMIN })).id;
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		student = await makeUser({ name: "Ada" });
		const course = await makeCourse({
			instructorId: instructor.id,
			title: "Rust",
		});
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 4900,
			stripePaymentIntentId: "pi_1",
		});
		ids = { paymentId: payment.id, courseId: course.id };
	});

	it("flags a full Dashboard refund and emails the admins once", async () => {
		await stripeEventService.handle(charge(4900), new Date());
		await stripeEventService.handle(charge(4900), new Date());

		expect(await needsReview()).not.toBeNull();
		expect(sent("admin.dashboard-refund")).toHaveLength(1);
	});

	it("flags a partial Dashboard refund and emails once per refunded amount", async () => {
		await stripeEventService.handle(charge(1000, "evt_p1"), new Date());
		await stripeEventService.handle(charge(1000, "evt_p1b"), new Date());

		expect(await needsReview()).not.toBeNull();
		expect(sent("admin.dashboard-refund")).toHaveLength(1);
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: ids.paymentId } }))
				.status,
		).toBe("succeeded");
	});

	it("does not flag Learnix's own refund", async () => {
		await makeRefundRequest({
			paymentId: ids.paymentId,
			studentId: student.id,
			courseId: ids.courseId,
			decision: "auto_approved",
			refundState: "processing",
		});

		await stripeEventService.handle(charge(4900), new Date());

		expect(await needsReview()).toBeNull();
		expect(sent("admin.dashboard-refund")).toHaveLength(0);
	});

	it("lists flagged payments for admins and clears one on mark reviewed (C17)", async () => {
		await stripeEventService.handle(charge(4900), new Date());
		const admin = callerFor(adminId, Role.ADMIN);

		const list = await admin.refundAdmin.listNeedsReview();
		expect(list.map((p) => p.paymentId)).toEqual([ids.paymentId]);
		await admin.refundAdmin.markReviewed({ paymentId: ids.paymentId });
		expect(await admin.refundAdmin.listNeedsReview()).toEqual([]);

		for (const role of [Role.STUDENT, Role.INSTRUCTOR]) {
			await expect(
				callerFor(student.id, role).refundAdmin.listNeedsReview(),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			await expect(
				callerFor(student.id, role).refundAdmin.markReviewed({
					paymentId: ids.paymentId,
				}),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
	});

	it("emails the student (access closed) and the admins once when a dispute is lost", async () => {
		await stripeEventService.handle(disputeLost(), new Date());
		await stripeEventService.handle(disputeLost(1_763_000_100), new Date());

		expect(sent("refund.dispute-lost")).toHaveLength(1);
		expect(sent("admin.dispute-lost")).toHaveLength(1);
		expect(sent("refund.dispute-lost")[0]?.[0].payload.body).toMatch(/access/i);
		expect(await needsReview()).toBeNull();
	});
});
