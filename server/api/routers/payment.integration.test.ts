import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma";
import { createCaller } from "@/server/api/root";
import { testDb, truncateAll } from "@/test/db";
import { makeUser } from "@/test/factories";

vi.mock("@/server/services/payments/stripe.client", () => ({
	stripe: { transfers: { create: vi.fn(), list: vi.fn() } },
}));

const lock = {
	acquire: vi.fn<(name: string, ttl: number) => Promise<string | null>>(),
	release: vi.fn<(name: string, token: string) => Promise<void>>(),
};
vi.mock("@/server/services/payments/runLock", () => ({
	getRunLock: () => lock,
}));

const callerFor = (id: string, role: Role) =>
	createCaller({
		db: testDb,
		headers: new Headers(),
		session: { user: { id, role }, session: { id: "s1" } },
	} as never);

describe("payment.runPayoutJobNow (FR-P24, AC-C16)", () => {
	beforeEach(async () => {
		await truncateAll();
		vi.clearAllMocks();
		lock.acquire.mockResolvedValue("token-1");
		lock.release.mockResolvedValue(undefined);
	});

	it.each([
		Role.STUDENT,
		Role.INSTRUCTOR,
	])("rejects a %s with FORBIDDEN and runs nothing", async (role) => {
		const user = await makeUser({ role });

		await expect(
			callerFor(user.id, role).payment.runPayoutJobNow(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(lock.acquire).not.toHaveBeenCalled();
	});

	it("runs the job for an admin and records a manual run", async () => {
		const admin = await makeUser({ role: Role.ADMIN });

		const summary = await callerFor(
			admin.id,
			Role.ADMIN,
		).payment.runPayoutJobNow();

		expect(summary).toMatchObject({ status: "completed", processed: 0 });
		expect(await testDb.payoutRun.findFirstOrThrow()).toMatchObject({
			trigger: "manual",
		});
	});

	it("reports CONFLICT when the job is already running", async () => {
		const admin = await makeUser({ role: Role.ADMIN });
		lock.acquire.mockResolvedValue(null);

		await expect(
			callerFor(admin.id, Role.ADMIN).payment.runPayoutJobNow(),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "The payout job is already running",
		});
	});

	it("no longer exposes the old Sweep procedure (AC-C14)", async () => {
		const admin = await makeUser({ role: Role.ADMIN });
		const caller = callerFor(admin.id, Role.ADMIN) as unknown as {
			payment: { sweepAllPendingTransfers: () => Promise<unknown> };
		};

		await expect(
			caller.payment.sweepAllPendingTransfers(),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});
