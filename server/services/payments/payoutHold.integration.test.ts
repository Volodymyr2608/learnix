import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeInstructorProfile,
	makePayment,
	makeUser,
} from "@/test/factories";

// AC-F13 end to end: real services and DB; Stripe, the run lock and enrolment side effects faked.
const stripeMock = vi.hoisted(() => ({
	sessionsRetrieve: vi.fn(),
	accountsRetrieve: vi.fn(),
	paymentIntentsRetrieve: vi.fn(),
	transfersList: vi.fn(),
	transfersCreate: vi.fn(),
	listReversals: vi.fn(),
	createReversal: vi.fn(),
}));

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		// Slice 3: the job replays refund events first; none here.
		events: { list: async () => ({ data: [], has_more: false }) },
		checkout: { sessions: { retrieve: stripeMock.sessionsRetrieve } },
		accounts: { retrieve: stripeMock.accountsRetrieve },
		paymentIntents: { retrieve: stripeMock.paymentIntentsRetrieve },
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
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: async () => undefined },
}));

const { paymentService } = await import("./payment.service");
const { payoutJobService } = await import("./payoutJob.service");

const DAY = 24 * 60 * 60 * 1000;
const SOLD_AT = new Date("2026-11-01T10:00:00.000Z");
const later = (days: number) => new Date(SOLD_AT.getTime() + days * DAY);

describe("a sale is held, then paid exactly once (AC-F13)", () => {
	let instructorId: string;
	let paymentId: string;

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		const instructor = await makeUser({ role: Role.INSTRUCTOR });
		instructorId = instructor.id;
		await makeInstructorProfile({
			userId: instructor.id,
			stripeAccountId: "acct_1",
			stripePayoutsEnabled: true,
		});
		const student = await makeUser();
		const course = await makeCourse({
			instructorId: instructor.id,
			status: "published",
			priceCents: 5000,
		});
		const payment = await makePayment({
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
			amountCents: 5000,
			status: "pending",
			transferStatus: "none",
			paidAt: null,
			platformFeeCents: null,
			instructorNetCents: null,
			stripeCheckoutSessionId: "cs_sale",
		});
		paymentId = payment.id;

		stripeMock.sessionsRetrieve.mockResolvedValue({
			payment_status: "paid",
			payment_intent: {
				id: "pi_sale",
				latest_charge: { id: "ch_sale", created: SOLD_AT.getTime() / 1000 },
			},
		});
		stripeMock.accountsRetrieve.mockResolvedValue({ payouts_enabled: true });
		stripeMock.paymentIntentsRetrieve.mockResolvedValue({
			latest_charge: { id: "ch_sale", refunded: false, disputed: false },
		});
		stripeMock.transfersList.mockResolvedValue({ data: [] });
		stripeMock.transfersCreate.mockResolvedValue({ id: "tr_sale" });
	});

	it("holds at sale, releases after the window, and never pays twice", async () => {
		await paymentService.finalizeCheckout("cs_sale");
		const sold = await testDb.payment.findUniqueOrThrow({
			where: { id: paymentId },
		});
		expect(sold).toMatchObject({
			status: "succeeded",
			transferStatus: "pending",
		});
		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();

		await payoutJobService.run({ trigger: "cron", now: later(2) });
		await payoutJobService.releaseForInstructor(instructorId, later(2));
		expect(stripeMock.transfersCreate).not.toHaveBeenCalled();

		const run = await payoutJobService.run({ trigger: "cron", now: later(15) });
		expect(run).toMatchObject({ status: "completed", released: 1 });
		expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(1);
		expect(stripeMock.transfersCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				amount: sold.instructorNetCents,
				transfer_group: paymentId,
			}),
			{ idempotencyKey: `transfer:${paymentId}` },
		);

		await payoutJobService.run({ trigger: "cron", now: later(16) });
		await payoutJobService.releaseForInstructor(instructorId, later(16));
		expect(stripeMock.transfersCreate).toHaveBeenCalledTimes(1);
		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({
			transferStatus: "transferred",
			stripeTransferId: "tr_sale",
		});
	});

	it("ends a refund committed between claim and transfer with exactly one reversal (AC-C5)", async () => {
		await paymentService.finalizeCheckout("cs_sale");
		stripeMock.listReversals.mockResolvedValue({ data: [] });
		stripeMock.createReversal.mockResolvedValue({ id: "trr_1" });
		// The refund's effects commit while the release is inside transfers.create.
		stripeMock.transfersCreate.mockImplementation(async () => {
			await testDb.payment.update({
				where: { id: paymentId },
				data: { status: "refunded", refundedAt: later(15) },
			});
			return { id: "tr_sale" };
		});

		const run = await payoutJobService.run({ trigger: "cron", now: later(15) });

		expect(stripeMock.createReversal).toHaveBeenCalledTimes(1);
		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({
			transferStatus: "reversed",
			stripeTransferId: "tr_sale",
		});
		expect(run).toMatchObject({ released: 0 });
	});
});
