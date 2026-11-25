import { beforeEach, describe, expect, it, vi } from "vitest";
import { payoutRepository } from "@/server/repositories/payout.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { testDb, truncateAll } from "@/test/db";
import {
	makeAppeal,
	makeCourse,
	makeInstructorProfile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";

vi.mock("@/server/services/email/email.service", () => ({
	emailService: { send: vi.fn().mockResolvedValue({ id: "em" }) },
}));

const { paymentService } = await import("./payment.service");

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe("the instructor's held amounts (FR-I1–I3, AC-F12, AC-C19, AC-F27)", () => {
	let instructorId: string;
	let studentId: string;
	let courseId: string;

	const sale = (
		overrides: Parameters<typeof makePayment>[0] extends infer T
			? Partial<T>
			: never = {},
	) =>
		makePayment({
			studentId,
			instructorId,
			courseId,
			transferStatus: "pending",
			instructorNetCents: 1000,
			paidAt: ago(1),
			...overrides,
		});

	const held = () =>
		payoutRepository.heldForInstructor(instructorId, new Date());

	beforeEach(async () => {
		await truncateAll();
		instructorId = (await makeUser({ role: "INSTRUCTOR" })).id;
		studentId = (await makeUser()).id;
		courseId = (await makeCourse({ instructorId })).id;
	});

	it("puts a sale inside the window on hold", async () => {
		await sale();
		expect(await held()).toEqual({
			onHoldCents: 1000,
			waitingForStripeCents: 0,
		});
	});

	it("puts an eligible sale of an instructor who cannot be paid under 'waiting for Stripe'", async () => {
		await makeInstructorProfile({
			userId: instructorId,
			stripeAccountId: null,
		});
		await sale({ paidAt: ago(20) });
		expect(await held()).toEqual({
			onHoldCents: 0,
			waitingForStripeCents: 1000,
		});
	});

	it("keeps a past-window sale with an open appeal on hold", async () => {
		await makeInstructorProfile({
			userId: instructorId,
			stripeAccountId: null,
		});
		const payment = await sale({ paidAt: ago(20) });
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId,
			decision: "direct_appeal",
		});
		await makeAppeal({ requestId: request.id, kind: "direct" });

		expect(await held()).toEqual({
			onHoldCents: 1000,
			waitingForStripeCents: 0,
		});
	});

	it("leaves a refunded sale out of both amounts and out of Paid Out (FR-I3)", async () => {
		await sale({
			status: "refunded",
			refundedAt: ago(0),
			transferStatus: "cancelled",
		});

		expect(await held()).toEqual({ onHoldCents: 0, waitingForStripeCents: 0 });
		const summary = await paymentService.getRevenueSummary(instructorId);
		expect(summary).toMatchObject({
			paidOutCents: 0,
			onHoldCents: 0,
			waitingForStripeCents: 0,
		});
	});

	it("answers the same with and without an open appeal, apart from the held amounts (AC-C19)", async () => {
		const payment = await sale({ paidAt: ago(20) });
		const before = {
			summary: await paymentService.getRevenueSummary(instructorId),
			transactions: await paymentService.getRecentTransactions(
				instructorId,
				10,
			),
		};
		const request = await makeRefundRequest({
			paymentId: payment.id,
			studentId,
			courseId,
			decision: "auto_denied",
			text: "a private reason",
		});
		await makeAppeal({ requestId: request.id, text: "my appeal text" });
		const after = {
			summary: await paymentService.getRevenueSummary(instructorId),
			transactions: await paymentService.getRecentTransactions(
				instructorId,
				10,
			),
		};

		const withoutHeld = (s: typeof before.summary) => ({
			...s,
			onHoldCents: 0,
			waitingForStripeCents: 0,
		});
		expect(withoutHeld(after.summary)).toEqual(withoutHeld(before.summary));
		expect(after.transactions).toEqual(before.transactions);
		expect(JSON.stringify(after)).not.toMatch(/private reason|appeal text/);
	});

	it("releases the held share of an instructor who deleted their account to the kept Stripe account (AC-F27)", async () => {
		await makeInstructorProfile({
			userId: instructorId,
			stripeAccountId: "acct_kept",
			stripePayoutsEnabled: true,
		});
		const payment = await sale({ paidAt: ago(20) });

		await userRepository.anonymiseAccount(instructorId);

		expect(
			(
				await testDb.instructorProfile.findUniqueOrThrow({
					where: { userId: instructorId },
				})
			).stripeAccountId,
		).toBe("acct_kept");
		expect(
			(await payoutRepository.findReleaseCandidates(new Date(), 10)).map(
				(p) => p.id,
			),
		).toContain(payment.id);
	});
});
