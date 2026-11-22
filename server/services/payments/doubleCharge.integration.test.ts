import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { refundRequestRepository } from "@/server/repositories/refundRequest.repository";
import { testDb, truncateAll } from "@/test/db";
import { makeCourse, makePayment, makeUser } from "@/test/factories";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send },
}));
const stripeMock = vi.hoisted(() => ({
	sessionsRetrieve: vi.fn(),
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		checkout: { sessions: { retrieve: stripeMock.sessionsRetrieve } },
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		transfers: { listReversals: vi.fn(), createReversal: vi.fn() },
	},
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: {
		recomputeUserInterest: vi.fn().mockResolvedValue(undefined),
	},
}));

const { paymentService } = await import("./payment.service");

const session = (pi: string) => ({
	payment_status: "paid",
	payment_intent: {
		id: pi,
		latest_charge: {
			created: 1_763_800_000,
			balance_transaction: { fee: 175 },
		},
	},
});

describe("a double charge is refunded at once (FR-P17, AC-F16, AC-C13)", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const checkout = (sessionId: string) =>
		makePayment({
			...ids,
			status: "pending",
			paidAt: null,
			transferStatus: "none",
			stripeCheckoutSessionId: sessionId,
		});

	const counted = () =>
		db.$transaction(async (tx) => ({
			d3: await refundRequestRepository.hasCountingRefund(
				tx,
				ids.studentId,
				ids.courseId,
			),
			limit: await refundRequestRepository.countAccountLimitRefunds(
				tx,
				ids.studentId,
				new Date(0),
			),
		}));

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		send.mockResolvedValue({ id: "em" });
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
		stripeMock.sessionsRetrieve.mockImplementation(async (id: string) =>
			session(`pi_${id}`),
		);
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch",
				amount: 4999,
				disputed: false,
				refunded: false,
			},
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockResolvedValue({
			id: "re_dup",
			status: "succeeded",
		});
	});

	it("refunds the second paid checkout, keeps the course, and does not count it", async () => {
		const first = await checkout("cs_a");
		const second = await checkout("cs_b");

		expect(await paymentService.finalizeCheckout("cs_a")).toEqual({
			status: "succeeded",
		});
		expect(await paymentService.finalizeCheckout("cs_b")).toEqual({
			status: "succeeded",
			duplicate: true,
		});

		const stored = async (id: string) =>
			testDb.payment.findUniqueOrThrow({ where: { id } });
		expect(await stored(first.id)).toMatchObject({
			status: "succeeded",
			transferStatus: "pending",
		});
		expect(await stored(second.id)).toMatchObject({
			status: "refunded",
			refundSource: "duplicate_charge",
			transferStatus: "none",
		});
		expect(stripeMock.refundsCreate).toHaveBeenCalledWith(
			{ payment_intent: "pi_cs_b" },
			{ idempotencyKey: `refund:${second.id}` },
		);
		expect(
			(
				await testDb.enrollment.findFirstOrThrow({
					where: { studentId: ids.studentId },
				})
			).status,
		).toBe("active");
		expect(await counted()).toEqual({ d3: false, limit: 0 });
		expect(
			send.mock.calls.filter(
				([a]) => a.templateKey === "refund.duplicate-charge",
			),
		).toHaveLength(1);
	});

	it("tells the student again on a repeat status check, without re-marking the payment", async () => {
		await checkout("cs_a");
		const second = await checkout("cs_b");
		await paymentService.finalizeCheckout("cs_a");
		await paymentService.finalizeCheckout("cs_b");

		expect(await paymentService.finalizeCheckout("cs_b")).toEqual({
			status: "succeeded",
			duplicate: true,
		});
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: second.id } }))
				.status,
		).toBe("refunded");
	});

	it("keeps exactly one of two concurrent finalizes; the other is refunded and never pending (AC-C13)", async () => {
		const a = await checkout("cs_a");
		const b = await checkout("cs_b");

		const results = await Promise.all([
			paymentService.finalizeCheckout("cs_a"),
			paymentService.finalizeCheckout("cs_b"),
		]);

		expect(results.filter((r) => "duplicate" in r)).toHaveLength(1);
		const rows = await testDb.payment.findMany({
			where: { id: { in: [a.id, b.id] } },
			select: { status: true, transferStatus: true },
		});
		expect(rows.map((r) => r.status).sort()).toEqual(["refunded", "succeeded"]);
		expect(rows.find((r) => r.status === "refunded")?.transferStatus).toBe(
			"none",
		);
	});
});
