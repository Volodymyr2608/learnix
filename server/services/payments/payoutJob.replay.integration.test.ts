import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
	eventsList: vi.fn(),
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
	accountsRetrieve: vi.fn(),
	transfersList: vi.fn(),
	transfersCreate: vi.fn(),
	listReversals: vi.fn(),
	createReversal: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		events: { list: stripeMock.eventsList },
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		accounts: { retrieve: stripeMock.accountsRetrieve },
		transfers: {
			list: stripeMock.transfersList,
			create: stripeMock.transfersCreate,
			listReversals: stripeMock.listReversals,
			createReversal: stripeMock.createReversal,
		},
	},
}));
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => ({
		acquire: async () => "token",
		release: async () => undefined,
	}),
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const { payoutJobService } = await import("./payoutJob.service");
const { refundEffectsService } = await import(
	"@/server/services/refund/refundEffects.service"
);
const { stripeEventService } = await import("./stripeEvent.service");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const EVENT_CREATED = Math.floor(NOW.getTime() / 1000) - 3600;

const refundedEvent = (paymentIntentId: string, amount = 4999): Stripe.Event =>
	({
		id: `evt_${paymentIntentId}`,
		type: "charge.refunded",
		created: EVENT_CREATED,
		data: {
			object: {
				id: `ch_${paymentIntentId}`,
				amount,
				amount_refunded: amount,
				payment_intent: paymentIntentId,
			},
		},
	}) as unknown as Stripe.Event;

describe("the daily job retries refunds and replays missed refund events (FR-P15, FR-S20)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const seedPayment = (overrides: Record<string, unknown> = {}) =>
		makePayment({
			...ids,
			amountCents: 4999,
			transferStatus: "pending",
			paidAt: new Date(NOW.getTime() - 2 * DAY),
			stripePaymentIntentId: `pi_${Math.random().toString(36).slice(2)}`,
			...overrides,
		});

	const statusOf = async (id: string) =>
		testDb.payment.findUniqueOrThrow({ where: { id } });

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		await makeInstructorProfile({
			userId: instructor.id,
			stripeAccountId: "acct_1",
			stripePayoutsEnabled: true,
		});
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
		await makeEnrollment({ studentId: student.id, courseId: course.id });
		stripeMock.eventsList.mockResolvedValue({ data: [], has_more: false });
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: { id: "ch", refunded: false, disputed: false },
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_1",
			status: "succeeded",
		});
		stripeMock.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
		stripeMock.transfersList.mockResolvedValue({ data: [] });
		stripeMock.transfersCreate.mockResolvedValue({ id: "tr_new" });
		stripeMock.listReversals.mockResolvedValue({ data: [] });
		stripeMock.createReversal.mockResolvedValue({ id: "trr_1" });
	});

	it("applies a charge.refunded that never arrived by webhook, once (AC-F26)", async () => {
		const payment = await seedPayment();
		stripeMock.eventsList.mockResolvedValue({
			data: [refundedEvent(payment.stripePaymentIntentId ?? "")],
			has_more: false,
		});

		const first = await payoutJobService.run({ trigger: "cron", now: NOW });
		const second = await payoutJobService.run({ trigger: "cron", now: NOW });

		expect((await statusOf(payment.id)).status).toBe("refunded");
		expect(first).toMatchObject({ eventsReplayed: 1 });
		expect(second).toMatchObject({ eventsReplayed: 1 }); // same second, replayed again: a no-op
		expect(stripeMock.eventsList).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "charge.refunded",
				created: { gte: EVENT_CREATED },
			}),
		);
		expect((await testDb.enrollment.findFirstOrThrow()).status).toBe(
			"cancelled",
		);
	});

	it("starts the first replay 30 days back (R6)", async () => {
		await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(stripeMock.eventsList).toHaveBeenCalledWith(
			expect.objectContaining({
				created: { gte: Math.floor(NOW.getTime() / 1000) - 30 * 24 * 3600 },
			}),
		);
	});

	it("applies the effects once when the webhook and the replay handle the same event concurrently (AC-C8)", async () => {
		const payment = await seedPayment({
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});
		const event = refundedEvent(payment.stripePaymentIntentId ?? "");
		stripeMock.eventsList.mockResolvedValue({ data: [event], has_more: false });

		await Promise.all([
			stripeEventService.handle(event, NOW),
			payoutJobService.run({ trigger: "cron", now: NOW }),
		]);

		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		expect((await statusOf(payment.id)).transferStatus).toBe("reversed");
	});

	it("does not release a payment the replay just refunded", async () => {
		const payment = await seedPayment({
			paidAt: new Date(NOW.getTime() - 20 * DAY),
		});
		stripeMock.eventsList.mockResolvedValue({
			data: [refundedEvent(payment.stripePaymentIntentId ?? "")],
			has_more: false,
		});

		await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();
		expect((await statusOf(payment.id)).transferStatus).toBe("cancelled");
	});

	it("retries a processing refund until Stripe accepts it (FR-S20)", async () => {
		const payment = await seedPayment();
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
			refundError: "Stripe timeout",
		});

		const summary = await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(summary).toMatchObject({ refundsRetried: 1 });
		expect(
			await testDb.refundRequest.findUniqueOrThrow({
				where: { id: request.id },
			}),
		).toMatchObject({
			refundState: "refunded",
			refundError: null,
		});
		expect((await statusOf(payment.id)).status).toBe("refunded");
	});

	it("retries a reversal that failed after a refund", async () => {
		const payment = await seedPayment({
			status: "refunded",
			refundedAt: NOW,
			transferStatus: "transferred",
			stripeTransferId: "tr_1",
		});

		await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		expect((await statusOf(payment.id)).transferStatus).toBe("reversed");
	});

	it("records the refund counts on the run", async () => {
		await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(await testDb.payoutRun.findFirstOrThrow()).toMatchObject({
			refundsRetried: 0,
			eventsReplayed: 0,
		});
	});

	it("retries a fresh processing refund even when 20 older ones never finish (audit M-2a)", async () => {
		for (let i = 0; i < 20; i++) {
			const stuck = await seedPayment({
				stripePaymentIntentId: `pi_disputed_${i}`,
			});
			await makeRefundRequest({
				paymentId: stuck.id,
				studentId: ids.studentId,
				courseId: ids.courseId,
				refundState: "processing",
				createdAt: new Date(NOW.getTime() - 5 * DAY),
			});
		}
		const fresh = await seedPayment({ stripePaymentIntentId: "pi_fresh" });
		const freshRequest = await makeRefundRequest({
			paymentId: fresh.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
		});
		stripeMock.piRetrieve.mockImplementation(async (id: string) => ({
			latest_charge: {
				id: `ch_${id}`,
				amount: 4999,
				refunded: false,
				disputed: id.startsWith("pi_disputed_"),
			},
		}));

		await payoutJobService.run({ trigger: "cron", now: NOW });
		await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(
			(
				await testDb.refundRequest.findUniqueOrThrow({
					where: { id: freshRequest.id },
				})
			).refundState,
		).toBe("refunded");
	});

	it("still releases payouts and records the run when a refund's effects keep failing (qa #3, audit M-2b)", async () => {
		const refunding = await seedPayment();
		await makeRefundRequest({
			paymentId: refunding.id,
			studentId: ids.studentId,
			courseId: ids.courseId,
			refundState: "processing",
		});
		const releasable = await seedPayment({
			paidAt: new Date(NOW.getTime() - 20 * DAY),
		});
		const spy = vi
			.spyOn(refundEffectsService, "apply")
			.mockRejectedValue(new Error("deadlock"));

		const summary = await payoutJobService.run({ trigger: "cron", now: NOW });

		spy.mockRestore();
		expect(summary).toMatchObject({ status: "completed", released: 1 });
		expect((await statusOf(releasable.id)).transferStatus).toBe("transferred");
		expect(await testDb.payoutRun.count()).toBe(1);
	});

	it("still releases payouts when listing Stripe events fails", async () => {
		const releasable = await seedPayment({
			paidAt: new Date(NOW.getTime() - 20 * DAY),
		});
		stripeMock.eventsList.mockRejectedValue(new Error("Stripe 500"));

		const summary = await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(summary).toMatchObject({
			status: "completed",
			released: 1,
			eventsReplayed: 0,
		});
		expect((await statusOf(releasable.id)).transferStatus).toBe("transferred");
	});
});
