import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(32);
const env: { CRON_SECRET: string | undefined } = { CRON_SECRET: SECRET };
vi.mock("@/lib/env", () => ({ env }));

const check = vi.fn();
vi.mock("@/server/services/payments/payoutWatchdog.service", () => ({
	payoutWatchdogService: { check },
}));

const { GET } = await import("./route");

const call = (authorization?: string) =>
	GET(
		new Request("http://localhost/api/cron/payout-watchdog", {
			headers: authorization ? { authorization } : {},
		}),
	);

describe("GET /api/cron/payout-watchdog (C15 reused, M3)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.CRON_SECRET = SECRET;
		check.mockResolvedValue({ stale: false, overdueRefunds: 2 });
	});

	it.each([
		["no header", undefined],
		["a wrong secret of the same length", `Bearer ${"x".repeat(32)}`],
		["a secret of another length", `Bearer ${SECRET}extra`],
	])("returns an empty 401 and checks nothing for %s", async (_label, header) => {
		const res = await call(header);

		expect(res.status).toBe(401);
		expect(await res.text()).toBe("");
		expect(check).not.toHaveBeenCalled();
	});

	it("refuses every caller when CRON_SECRET is shorter than 32 characters", async () => {
		env.CRON_SECRET = "s".repeat(31);

		expect((await call(`Bearer ${"s".repeat(31)}`)).status).toBe(401);
		expect(check).not.toHaveBeenCalled();
	});

	it("runs the check for the scheduler's secret and returns its counts", async () => {
		const res = await call(`Bearer ${SECRET}`);

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ stale: false, overdueRefunds: 2 });
	});
});
