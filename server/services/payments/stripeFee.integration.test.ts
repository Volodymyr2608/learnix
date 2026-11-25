import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makePayment, makeUser } from "@/test/factories";

const stripeMock = vi.hoisted(() => ({
	sessionsRetrieve: vi.fn(),
	piRetrieve: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		checkout: { sessions: { retrieve: stripeMock.sessionsRetrieve } },
		paymentIntents: { retrieve: stripeMock.piRetrieve },
	},
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue(undefined) },
}));

const { paymentService } = await import("./payment.service");

const DAY = 24 * 60 * 60 * 1000;
const CREATED = 1_763_800_000;

const paidSession = (balanceTransaction: unknown) => ({
	payment_status: "paid",
	payment_intent: {
		id: "pi_fee",
		latest_charge: {
			created: CREATED,
			balance_transaction: balanceTransaction,
		},
	},
});

describe("every payment records its Stripe fee (FR-P28, AC-F28)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const pending = (sessionId: string) =>
		makePayment({
			...ids,
			status: "pending",
			paidAt: null,
			stripeCheckoutSessionId: sessionId,
		});

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
		});
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
	});

	it("stores the fee from the charge's balance transaction", async () => {
		const payment = await pending("cs_fee_1");
		stripeMock.sessionsRetrieve.mockResolvedValue(paidSession({ fee: 175 }));

		expect(await paymentService.finalizeCheckout("cs_fee_1")).toMatchObject({
			status: "succeeded",
		});

		expect(stripeMock.sessionsRetrieve).toHaveBeenCalledWith("cs_fee_1", {
			expand: ["payment_intent.latest_charge.balance_transaction"],
		});
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }))
				.stripeFeeCents,
		).toBe(175);
	});

	it("still succeeds without a fee when the balance transaction is not available", async () => {
		const payment = await pending("cs_fee_2");
		stripeMock.sessionsRetrieve.mockResolvedValue(
			paidSession("txn_not_expanded"),
		);

		expect(await paymentService.finalizeCheckout("cs_fee_2")).toMatchObject({
			status: "succeeded",
		});
		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: payment.id } }),
		).toMatchObject({ status: "succeeded", stripeFeeCents: null });
	});

	it("fills missing fees of recent payments in the daily job, and survives a failing read", async () => {
		const now = new Date();
		const recent = await makePayment({
			...ids,
			paidAt: new Date(now.getTime() - DAY),
			stripePaymentIntentId: "pi_recent",
		});
		const failing = await makePayment({
			...ids,
			paidAt: new Date(now.getTime() - DAY),
			stripePaymentIntentId: "pi_failing",
		});
		const old = await makePayment({
			...ids,
			paidAt: new Date(now.getTime() - 60 * DAY),
			stripePaymentIntentId: "pi_old",
		});
		stripeMock.piRetrieve.mockImplementation(async (id: string) => {
			if (id === "pi_failing") throw new Error("Stripe 500");
			return { latest_charge: { balance_transaction: { fee: 99 } } };
		});

		expect(await paymentService.fillMissingFees(now)).toBe(1);

		const fee = async (id: string) =>
			(await testDb.payment.findUniqueOrThrow({ where: { id } }))
				.stripeFeeCents;
		expect(await fee(recent.id)).toBe(99);
		expect(await fee(failing.id)).toBeNull();
		expect(await fee(old.id)).toBeNull();
	});

	it("runs the fill-in from the daily payout job", async () => {
		const spy = vi
			.spyOn(paymentService, "fillMissingFees")
			.mockResolvedValue(0);
		const { payoutJobService } = await import("./payoutJob.service");

		await payoutJobService.run({ trigger: "manual", now: new Date() });

		expect(spy).toHaveBeenCalled();
	});
});
