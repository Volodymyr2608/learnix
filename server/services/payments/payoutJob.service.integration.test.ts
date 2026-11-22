import { beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncateAll } from "@/test/db";
import {
	makeCourse,
	makeInstructorProfile,
	makePayment,
	makeUser,
} from "@/test/factories";

// Real DB, fake Stripe and a controllable run lock.
const mockAccountsRetrieve = vi.fn();
const mockPaymentIntentsRetrieve = vi.fn();
const mockTransfersList = vi.fn();
const mockTransfersCreate = vi.fn();

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: {
		accounts: { retrieve: mockAccountsRetrieve },
		paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
		transfers: { list: mockTransfersList, create: mockTransfersCreate },
	},
}));

const lock = {
	acquire: vi.fn<(name: string, ttl: number) => Promise<string | null>>(),
	release: vi.fn<(name: string, token: string) => Promise<void>>(),
};
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => lock,
}));

const { payoutJobService } = await import("./payoutJob.service");
const { payoutRunRepository } = await import(
	"@/server/repositories/payoutRun.repository"
);

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T10:00:00.000Z");
const PAID_LONG_AGO = new Date(NOW.getTime() - 20 * DAY);
const PAID_RECENTLY = new Date(NOW.getTime() - 2 * DAY);

describe("payoutJobService", () => {
	let ids: { studentId: string; instructorId: string; courseId: string };

	const seed = (count: number, overrides: Record<string, unknown> = {}) =>
		Promise.all(
			Array.from({ length: count }, (_, i) =>
				makePayment({
					...ids,
					transferStatus: "pending",
					paidAt: new Date(PAID_LONG_AGO.getTime() + i * 1000),
					stripePaymentIntentId: `pi_${i}_${Math.random()}`,
					...overrides,
				}),
			),
		);

	const countBy = (transferStatus: "transferred" | "pending") =>
		testDb.payment.count({ where: { transferStatus } });

	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		const instructor = await makeUser({ role: "INSTRUCTOR" });
		await makeInstructorProfile({
			userId: instructor.id,
			stripeAccountId: "acct_1",
		});
		const student = await makeUser();
		const course = await makeCourse({ instructorId: instructor.id });
		ids = {
			studentId: student.id,
			instructorId: instructor.id,
			courseId: course.id,
		};
		lock.acquire.mockResolvedValue("token-1");
		lock.release.mockResolvedValue(undefined);
		mockAccountsRetrieve.mockResolvedValue({ payouts_enabled: true });
		mockPaymentIntentsRetrieve.mockResolvedValue({
			latest_charge: { id: "ch_1", refunded: false, disputed: false },
		});
		mockTransfersList.mockResolvedValue({ data: [] });
		let n = 0;
		mockTransfersCreate.mockImplementation(async () => ({ id: `tr_${n++}` }));
	});

	it("releases 50 of 51 eligible payments per run, the last one on the next run (AC-F25)", async () => {
		await seed(51);

		const first = await payoutJobService.run({ trigger: "cron", now: NOW });
		expect(first).toMatchObject({
			status: "completed",
			processed: 50,
			released: 50,
		});
		expect(await countBy("transferred")).toBe(50);

		const second = await payoutJobService.run({ trigger: "cron", now: NOW });
		expect(second).toMatchObject({
			status: "completed",
			processed: 1,
			released: 1,
		});
		expect(await countBy("transferred")).toBe(51);
	});

	it("keeps going past a failing payment and records the run (FR-P5)", async () => {
		const [failing] = await seed(3);
		mockTransfersCreate.mockImplementation(
			async (params: { transfer_group: string }) => {
				if (params.transfer_group === failing?.id)
					throw new Error("Stripe timeout");
				return { id: `tr_${params.transfer_group}` };
			},
		);

		const summary = await payoutJobService.run({ trigger: "cron", now: NOW });

		expect(summary).toMatchObject({ processed: 3, released: 2, failed: 1 });
		const run = await testDb.payoutRun.findFirstOrThrow();
		expect(run).toMatchObject({ trigger: "cron", processed: 3, released: 2 });
		expect(run.finishedAt).toBeInstanceOf(Date);
		expect(run.failures).toEqual([
			{ paymentId: failing?.id, error: "Stripe timeout" },
		]);
		expect(run.paymentIds).toHaveLength(3);
		expect(lock.release).toHaveBeenCalledWith("payouts", "token-1");
	});

	it("does nothing when another run holds the lock (AC-C16)", async () => {
		await seed(2);
		lock.acquire.mockResolvedValue(null);

		const summary = await payoutJobService.run({ trigger: "manual", now: NOW });

		expect(summary).toEqual({ status: "already_running" });
		expect(await countBy("pending")).toBe(2);
		expect(await testDb.payoutRun.count()).toBe(0);
		expect(lock.release).not.toHaveBeenCalled();
	});

	it("releases the lock even when recording the run throws", async () => {
		await seed(1);
		const spy = vi
			.spyOn(payoutRunRepository, "record")
			.mockRejectedValueOnce(new Error("db down"));

		await payoutJobService
			.run({ trigger: "cron", now: NOW })
			.catch(() => undefined);

		expect(lock.release).toHaveBeenCalledWith("payouts", "token-1");
		spy.mockRestore();
	});

	describe("releaseForInstructor (account.updated, FR-P2)", () => {
		it("pays the instructor's eligible sales and keeps a held one", async () => {
			await seed(1);
			const [held] = await seed(1, { paidAt: PAID_RECENTLY });

			const summary = await payoutJobService.releaseForInstructor(
				ids.instructorId,
				NOW,
			);

			expect(summary).toMatchObject({ processed: 2, released: 1 });
			const stillHeld = await testDb.payment.findUniqueOrThrow({
				where: { id: held?.id },
			});
			expect(stillHeld.transferStatus).toBe("pending");
			expect(await testDb.payoutRun.findFirstOrThrow()).toMatchObject({
				trigger: "account_updated",
			});
		});
	});
});
