import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeInstructorProfile,
	makePayment,
	makeRefundRequest,
	makeUser,
} from "@/test/factories";
import { payoutRepository } from "./payout.repository";

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;
const DAY = 24 * HOUR;
const PAID_AT = new Date("2026-11-01T10:00:00.000Z");
const at = (ms: number) => new Date(PAID_AT.getTime() + ms);
const ELIGIBLE = at(14 * DAY + HOUR);

describe("payoutRepository", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const seedPayment = (
		overrides: Parameters<typeof makePayment>[0] extends infer T
			? Partial<T>
			: never = {},
	) =>
		makePayment({
			...ids,
			transferStatus: "pending",
			paidAt: PAID_AT,
			createdAt: at(-10 * 60 * SECOND),
			...overrides,
		});

	const status = async (id: string) =>
		(await testDb.payment.findUniqueOrThrow({ where: { id } })).transferStatus;

	beforeEach(async () => {
		await truncateAll();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
	});

	describe("claimForRelease — window edge (AC-C5)", () => {
		it.each([
			["14 d − 1 s", at(14 * DAY - SECOND)],
			["inside the 1 h margin", at(14 * DAY + HOUR - SECOND)],
		])("does not claim at %s", async (_label, now) => {
			const payment = await seedPayment();

			expect(await payoutRepository.claimForRelease(payment.id, now)).toBe(
				false,
			);
			expect(await status(payment.id)).toBe("pending");
		});

		it("claims at 14 d + 1 h, moving pending to transferring", async () => {
			const payment = await seedPayment();

			expect(await payoutRepository.claimForRelease(payment.id, ELIGIBLE)).toBe(
				true,
			);
			expect(await status(payment.id)).toBe("transferring");
		});

		it("claims an unknown paidAt only after createdAt + 24 h + 14 d + 1 h (H1)", async () => {
			const createdAt = at(0);
			const payment = await seedPayment({ paidAt: null, createdAt });
			const bound = createdAt.getTime() + DAY + 14 * DAY + HOUR;

			expect(
				await payoutRepository.claimForRelease(
					payment.id,
					new Date(bound - SECOND),
				),
			).toBe(false);
			expect(
				await payoutRepository.claimForRelease(payment.id, new Date(bound)),
			).toBe(true);
		});
	});

	describe("claimForRelease — what blocks release (AC-C6, FR-P2a)", () => {
		it("does not claim a refunded payment", async () => {
			const payment = await seedPayment({
				status: "refunded",
				refundedAt: at(DAY),
			});
			expect(await payoutRepository.claimForRelease(payment.id, ELIGIBLE)).toBe(
				false,
			);
		});

		it("does not claim a payment that is not pending", async () => {
			const payment = await seedPayment({ transferStatus: "transferred" });
			expect(await payoutRepository.claimForRelease(payment.id, ELIGIBLE)).toBe(
				false,
			);
		});

		it("does not claim while an approved request has no refund yet (H2)", async () => {
			const payment = await seedPayment();
			await makeRefundRequest({
				paymentId: payment.id,
				studentId: ids.studentId,
				courseId: ids.courseId,
				decision: "auto_approved",
				createdAt: at(DAY),
			});
			expect(await payoutRepository.claimForRelease(payment.id, ELIGIBLE)).toBe(
				false,
			);
		});

		it("does not claim while a denied request still has its appeal right (H3)", async () => {
			const payment = await seedPayment();
			const deniedAt = at(13 * DAY);
			await makeRefundRequest({
				paymentId: payment.id,
				studentId: ids.studentId,
				courseId: ids.courseId,
				decision: "auto_denied",
				createdAt: deniedAt,
			});
			const deadline = deniedAt.getTime() + 3 * DAY;

			expect(
				await payoutRepository.claimForRelease(
					payment.id,
					new Date(deadline - SECOND),
				),
			).toBe(false);
			expect(
				await payoutRepository.claimForRelease(payment.id, new Date(deadline)),
			).toBe(true);
		});

		it("claims after an early denial once the window has closed", async () => {
			const payment = await seedPayment();
			await makeRefundRequest({
				paymentId: payment.id,
				studentId: ids.studentId,
				courseId: ids.courseId,
				decision: "auto_denied",
				createdAt: at(DAY),
			});
			expect(await payoutRepository.claimForRelease(payment.id, ELIGIBLE)).toBe(
				true,
			);
		});
	});

	it("lets exactly one of two concurrent claims win (FR-P4)", async () => {
		const payment = await seedPayment();

		const results = await Promise.all([
			payoutRepository.claimForRelease(payment.id, ELIGIBLE),
			payoutRepository.claimForRelease(payment.id, ELIGIBLE),
		]);

		expect(results.filter(Boolean)).toHaveLength(1);
	});

	describe("findReleaseCandidates", () => {
		it("returns eligible pending and every transferring payment, least recently touched first, up to the limit", async () => {
			await makeInstructorProfile({
				userId: ids.instructorId,
				stripeAccountId: "acct_1",
				stripePayoutsEnabled: true,
			});
			const old = await seedPayment({ paidAt: at(-2 * DAY) });
			const eligible = await seedPayment();
			const stuck = await seedPayment({ transferStatus: "transferring" });
			await seedPayment({ paidAt: at(DAY) }); // window not closed yet
			await seedPayment({ transferStatus: "transferred" });

			const all = await payoutRepository.findReleaseCandidates(ELIGIBLE, 10);
			expect(all.map((p) => p.id).sort()).toEqual(
				[old.id, eligible.id, stuck.id].sort(),
			);

			const limited = await payoutRepository.findReleaseCandidates(ELIGIBLE, 1);
			expect(limited.map((p) => p.id)).toEqual([old.id]);
		});

		it("leaves out pending sales of an instructor who cannot be paid", async () => {
			await makeInstructorProfile({
				userId: ids.instructorId,
				stripeAccountId: null,
			});
			await seedPayment();

			expect(
				await payoutRepository.findReleaseCandidates(ELIGIBLE, 10),
			).toEqual([]);
		});
	});

	describe("markTransferred / releaseClaim", () => {
		it("moves transferring to transferred with the transfer id, once", async () => {
			const payment = await seedPayment({ transferStatus: "transferring" });

			expect(
				await payoutRepository.markTransferred(payment.id, "tr_1", ELIGIBLE),
			).toBe(true);
			expect(
				await payoutRepository.markTransferred(payment.id, "tr_2", ELIGIBLE),
			).toBe(false);

			const stored = await testDb.payment.findUniqueOrThrow({
				where: { id: payment.id },
			});
			expect(stored).toMatchObject({
				transferStatus: "transferred",
				stripeTransferId: "tr_1",
				transferredAt: ELIGIBLE,
			});
		});

		it("returns a claimed payment to pending", async () => {
			const payment = await seedPayment({ transferStatus: "transferring" });

			expect(await payoutRepository.releaseClaim(payment.id)).toBe(true);
			expect(await status(payment.id)).toBe("pending");
		});
	});
});
