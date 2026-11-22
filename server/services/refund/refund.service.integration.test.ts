import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundSnapshot } from "@/server/entities/refund/refund.dto";
import { testDb } from "@/test/db";
import {
	makeCourse,
	makeEnrollment,
	makeLesson,
	makeOpenedLesson,
	makePayment,
	makeRefundRequest,
	makeSection,
	makeUser,
} from "@/test/factories";
import { refundService } from "./refund.service";

const stripeMock = vi.hoisted(() => ({
	piRetrieve: vi.fn(),
	refundsList: vi.fn(),
	refundsCreate: vi.fn(),
}));
vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		paymentIntents: { retrieve: stripeMock.piRetrieve },
		refunds: { list: stripeMock.refundsList, create: stripeMock.refundsCreate },
		transfers: { listReversals: vi.fn(), createReversal: vi.fn() },
	},
}));
vi.mock("@/server/services/embeddings/embeddings.service", () => ({
	embeddingsService: { recomputeUserInterest: async () => undefined },
}));

const flag = vi.hoisted(() => ({ on: true }));
vi.mock("./refundFlag", () => ({ isStudentRefundEnabled: () => flag.on }));

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

type Seeded = {
	studentId: string;
	instructorId: string;
	courseId: string;
	paymentId: string;
	lessonIds: string[];
};

const seedPurchase = async (opts: {
	studentId?: string;
	lessons?: number;
	opened?: number;
	paidAt?: Date | null;
	completedAt?: Date;
}): Promise<Seeded> => {
	const instructor = await makeUser({ role: "INSTRUCTOR" });
	const studentId = opts.studentId ?? (await makeUser()).id;
	const course = await makeCourse({
		instructorId: instructor.id,
		priceCents: 4999,
	});
	const section = await makeSection({ courseId: course.id });
	const lessonIds: string[] = [];
	for (let order = 0; order < (opts.lessons ?? 6); order++) {
		lessonIds.push((await makeLesson({ sectionId: section.id, order })).id);
	}
	for (const lessonId of lessonIds.slice(0, opts.opened ?? 0)) {
		await makeOpenedLesson({ studentId, lessonId });
	}
	await makeEnrollment({
		studentId,
		courseId: course.id,
		completedAt: opts.completedAt,
	});
	const payment = await makePayment({
		studentId,
		instructorId: instructor.id,
		courseId: course.id,
		paidAt: opts.paidAt === undefined ? daysAgo(3) : opts.paidAt,
		transferStatus: "pending",
		stripePaymentIntentId: `pi_${Math.random().toString(36).slice(2)}`,
	});
	return {
		studentId,
		instructorId: instructor.id,
		courseId: course.id,
		paymentId: payment.id,
		lessonIds,
	};
};

const request = (studentId: string, paymentId: string, text?: string) =>
	refundService.requestRefund(studentId, {
		paymentId,
		reason: "too_easy",
		text,
	});

/** Earlier auto-approved refunds on other courses, `ageDays` old. */
const seedAccountLimitRefunds = async (
	studentId: string,
	count: number,
	ageDays = 30,
) => {
	for (let i = 0; i < count; i++) {
		const other = await seedPurchase({ studentId });
		await makeRefundRequest({
			paymentId: other.paymentId,
			studentId,
			courseId: other.courseId,
			createdAt: daysAgo(ageDays),
		});
	}
};

describe("refundService.requestRefund", () => {
	beforeEach(() => {
		flag.on = true;
		vi.clearAllMocks();
		stripeMock.piRetrieve.mockResolvedValue({
			latest_charge: { id: "ch_1", disputed: false, refunded: false },
		});
		stripeMock.refundsList.mockResolvedValue({ data: [] });
		stripeMock.refundsCreate.mockImplementation(async () => ({
			id: `re_${Math.random().toString(36).slice(2)}`,
			status: "succeeded",
		}));
	});

	it("refunds an approved request at once and applies its effects (AC-F2, FR-S6)", async () => {
		const { studentId, paymentId } = await seedPurchase({ opened: 1 });

		const result = await request(studentId, paymentId);

		expect(result).toMatchObject({
			decision: "auto_approved",
			refundStatus: "refunded",
		});
		expect(stripeMock.refundsCreate).toHaveBeenCalledTimes(1);
		expect(
			await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }),
		).toMatchObject({ status: "refunded", transferStatus: "cancelled" });
		expect(
			await testDb.refundRequest.findUniqueOrThrow({ where: { paymentId } }),
		).toMatchObject({
			refundState: "refunded",
			stripeRefundId: expect.stringMatching(/^re_/),
		});
		expect(
			(await testDb.enrollment.findFirstOrThrow({ where: { studentId } }))
				.status,
		).toBe("cancelled");
	});

	it("tells the student 'processing' — never Stripe's text — when Stripe fails (FR-S20)", async () => {
		stripeMock.refundsCreate.mockRejectedValue(
			new Error("Your card was declined"),
		);
		const { studentId, paymentId } = await seedPurchase({});

		const result = await request(studentId, paymentId);

		expect(result).toMatchObject({
			decision: "auto_approved",
			refundStatus: "processing",
		});
		expect(JSON.stringify(result)).not.toContain("declined");
		expect(
			(await testDb.payment.findUniqueOrThrow({ where: { id: paymentId } }))
				.status,
		).toBe("succeeded");
	});

	it("makes one Stripe refund for two concurrent requests on one payment (AC-C3)", async () => {
		const { studentId, paymentId } = await seedPurchase({});

		await Promise.allSettled([
			request(studentId, paymentId),
			request(studentId, paymentId),
		]);

		expect(stripeMock.refundsCreate).toHaveBeenCalledTimes(1);
	});

	it("approves automatically and stores the snapshot (AC-F2)", async () => {
		const { studentId, paymentId } = await seedPurchase({
			lessons: 6,
			opened: 2,
		});

		const result = await request(studentId, paymentId);

		expect(result.decision).toBe("auto_approved");
		expect(result.failedConditions).toEqual([]);
		const row = await testDb.refundRequest.findUniqueOrThrow({
			where: { paymentId },
		});
		const snapshot = row.snapshot as RefundSnapshot;
		expect(snapshot).toMatchObject({
			openedCount: 2,
			lessonCount: 6,
			threshold: 3,
			accountLimitRefunds12m: 0,
		});
		expect(row.id).toBe(result.requestId);
	});

	it("denies over the threshold, naming it (AC-F5)", async () => {
		const { studentId, paymentId } = await seedPurchase({
			lessons: 4,
			opened: 3,
		});

		const result = await request(studentId, paymentId);

		expect(result).toMatchObject({
			decision: "auto_denied",
			failedConditions: ["threshold"],
		});
	});

	it("denies with a certificate (P6: completed enrollment)", async () => {
		const { studentId, paymentId } = await seedPurchase({
			completedAt: daysAgo(1),
		});

		expect((await request(studentId, paymentId)).failedConditions).toEqual([
			"certificate",
		]);
	});

	it("denies outside the window", async () => {
		const { studentId, paymentId } = await seedPurchase({
			paidAt: daysAgo(15),
		});

		expect((await request(studentId, paymentId)).failedConditions).toEqual([
			"window",
		]);
	});

	it("denies when paidAt is unknown (P4)", async () => {
		const { studentId, paymentId } = await seedPurchase({ paidAt: null });

		expect((await request(studentId, paymentId)).failedConditions).toEqual([
			"window",
		]);
	});

	it("denies after an earlier counting refund of the same course (D3)", async () => {
		const first = await seedPurchase({});
		await makeRefundRequest({
			paymentId: first.paymentId,
			studentId: first.studentId,
			courseId: first.courseId,
		});
		const repurchase = await makePayment({
			studentId: first.studentId,
			instructorId: first.instructorId,
			courseId: first.courseId,
			paidAt: daysAgo(1),
		});

		expect(
			(await request(first.studentId, repurchase.id)).failedConditions,
		).toEqual(["earlier_refund"]);
	});

	it("denies at 3 account-limit refunds in 12 months", async () => {
		const { studentId, paymentId } = await seedPurchase({});
		await seedAccountLimitRefunds(studentId, 3);

		expect((await request(studentId, paymentId)).failedConditions).toEqual([
			"account_limit",
		]);
	});

	it("ignores account-limit refunds older than 12 months", async () => {
		const { studentId, paymentId } = await seedPurchase({});
		await seedAccountLimitRefunds(studentId, 3, 13 * 30);

		expect((await request(studentId, paymentId)).decision).toBe(
			"auto_approved",
		);
	});

	it("returns NOT_FOUND for another student's payment and writes nothing (AC-C1)", async () => {
		const victim = await seedPurchase({});
		const attacker = await makeUser();

		await expect(request(attacker.id, victim.paymentId)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("returns NOT_FOUND, not CONFLICT, when another student's payment already has a request (AC-C1, no existence oracle)", async () => {
		const victim = await seedPurchase({});
		await request(victim.studentId, victim.paymentId);
		const attacker = await makeUser();

		await expect(request(attacker.id, victim.paymentId)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it.each([
		"pending",
		"refunded",
	] as const)("returns NOT_FOUND for a %s payment", async (status) => {
		const { studentId, paymentId } = await seedPurchase({});
		await testDb.payment.update({ where: { id: paymentId }, data: { status } });

		await expect(request(studentId, paymentId)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	it("rejects a second request on the same payment (AC-F6)", async () => {
		const { studentId, paymentId } = await seedPurchase({});
		await request(studentId, paymentId);

		await expect(request(studentId, paymentId)).rejects.toMatchObject({
			code: "CONFLICT",
		});
	});

	it("creates one row for two concurrent requests on one payment (AC-C3)", async () => {
		const { studentId, paymentId } = await seedPurchase({});

		const results = await Promise.allSettled([
			request(studentId, paymentId),
			request(studentId, paymentId),
		]);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((r) => r.status === "rejected");
		expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({
			code: "CONFLICT",
		});
		expect(await testDb.refundRequest.count({ where: { paymentId } })).toBe(1);
	});

	it("approves exactly one of three concurrent requests at the account limit (AC-C4)", async () => {
		const student = await makeUser();
		await seedAccountLimitRefunds(student.id, 2);
		const purchases = [
			await seedPurchase({ studentId: student.id }),
			await seedPurchase({ studentId: student.id }),
			await seedPurchase({ studentId: student.id }),
		];

		const results = await Promise.all(
			purchases.map((p) => request(student.id, p.paymentId)),
		);

		expect(results.filter((r) => r.decision === "auto_approved")).toHaveLength(
			1,
		);
		const denied = results.filter((r) => r.decision === "auto_denied");
		expect(denied).toHaveLength(2);
		for (const d of denied)
			expect(d.failedConditions).toEqual(["account_limit"]);
	});

	it("returns NOT_FOUND with the flag off and writes nothing (AC-C24)", async () => {
		flag.on = false;
		const { studentId, paymentId } = await seedPurchase({});

		await expect(request(studentId, paymentId)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
		expect(await testDb.refundRequest.count()).toBe(0);
	});

	it("stores the free text exactly as typed (AC-C22)", async () => {
		const { studentId, paymentId } = await seedPurchase({});
		const text = "<img src=x onerror=alert(1)>";

		await request(studentId, paymentId, text);

		const row = await testDb.refundRequest.findUniqueOrThrow({
			where: { paymentId },
		});
		expect(row.text).toBe(text);
	});
});
