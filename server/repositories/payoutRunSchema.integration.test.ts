import { beforeEach, describe, expect, it } from "vitest";
import { testDb, truncateAll } from "@/test/db";

describe("payout run schema (M1)", () => {
	beforeEach(async () => {
		await truncateAll();
	});

	it("keeps an unfinished run and the error of a crashed one", async () => {
		const started = await testDb.payoutRun.create({
			data: { trigger: "cron" },
		});
		expect(started.finishedAt).toBeNull();

		const crashed = await testDb.payoutRun.update({
			where: { id: started.id },
			data: { finishedAt: new Date(), error: "connection lost" },
		});
		expect(crashed.error).toBe("connection lost");
	});
});
