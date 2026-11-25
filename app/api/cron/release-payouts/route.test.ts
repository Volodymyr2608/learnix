import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "s".repeat(32);
const env: { CRON_SECRET: string | undefined } = { CRON_SECRET: SECRET };
vi.mock("@/lib/env", () => ({ env }));

const run = vi.fn();
vi.mock("@/server/services/payments/payoutJob.service", () => ({
	payoutJobService: { run },
}));

const { GET } = await import("./route");

const call = (authorization?: string) =>
	GET(
		new Request("http://localhost/api/cron/release-payouts", {
			headers: authorization ? { authorization } : {},
		}),
	);

describe("GET /api/cron/release-payouts (AC-C15, FR-P25)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		env.CRON_SECRET = SECRET;
		run.mockResolvedValue({
			status: "completed",
			runId: "run_1",
			processed: 3,
			released: 2,
			failed: 1,
		});
	});

	it.each([
		["no header", undefined],
		["a wrong secret of the same length", `Bearer ${"x".repeat(32)}`],
		["a secret of another length", `Bearer ${SECRET}extra`],
		["the secret without the Bearer scheme", SECRET],
	])("returns an empty 401 and runs nothing for %s", async (_label, header) => {
		const res = await call(header);

		expect(res.status).toBe(401);
		expect(await res.text()).toBe("");
		expect(run).not.toHaveBeenCalled();
	});

	it("runs the job for the scheduler's secret and returns counts only", async () => {
		const res = await call(`Bearer ${SECRET}`);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({
			status: "completed",
			processed: 3,
			released: 2,
			failed: 1,
		});
		expect(JSON.stringify(body)).not.toMatch(/paymentIds|pay_/);
		expect(run).toHaveBeenCalledWith({
			trigger: "cron",
			now: expect.any(Date),
		});
	});

	it("reports an overlapping run without running", async () => {
		run.mockResolvedValue({ status: "already_running" });

		const res = await call(`Bearer ${SECRET}`);

		expect(await res.json()).toEqual({ status: "already_running" });
	});

	it.each([
		["shorter than 32 characters", "s".repeat(31)],
		["missing", undefined],
	])("refuses every caller when CRON_SECRET is %s", async (_label, secret) => {
		env.CRON_SECRET = secret;

		const res = await call(`Bearer ${secret ?? ""}`);

		expect(res.status).toBe(401);
		expect(run).not.toHaveBeenCalled();
	});
});
