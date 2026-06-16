import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PLATFORM_SECRET = "whsec_platform";
const CONNECT_SECRET = "whsec_connect";

vi.mock("@/lib/env", () => ({
	env: {
		STRIPE_SECRET_KEY: "sk_test_mock",
		STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET,
		STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
	},
}));

vi.mock("@/server/repositories/instructor.repository", () => ({
	instructorRepository: { findFirst: vi.fn() },
}));

vi.mock("@/server/repositories/payment.repository", () => ({
	processedStripeEventRepository: { exists: vi.fn(), record: vi.fn() },
}));

vi.mock("@/server/services/payments/connect.service", () => ({
	connectService: {
		syncAccountStatus: vi.fn(),
		sweepPendingTransfers: vi.fn(),
	},
}));

vi.mock("@/server/services/payments/payment.service", () => ({
	paymentService: { finalizeCheckout: vi.fn(), handleRefund: vi.fn() },
}));

const { POST } = await import("./route");
const { instructorRepository } = await import(
	"@/server/repositories/instructor.repository"
);
const { processedStripeEventRepository } = await import(
	"@/server/repositories/payment.repository"
);
const { connectService } = await import(
	"@/server/services/payments/connect.service"
);

const mockInstructorRepo = vi.mocked(instructorRepository);
const mockProcessedRepo = vi.mocked(processedStripeEventRepository);
const mockConnectService = vi.mocked(connectService);

// Pure-crypto signing helper — works offline.
const signer = new Stripe("sk_test_mock");

function buildRequest(payload: string, secret: string): Request {
	const header = signer.webhooks.generateTestHeaderString({ payload, secret });
	return new Request("http://localhost/api/stripe/webhook", {
		method: "POST",
		headers: { "stripe-signature": header },
		body: payload,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockProcessedRepo.exists.mockResolvedValue(false);
	mockProcessedRepo.record.mockResolvedValue(undefined as never);
});

describe("POST /api/stripe/webhook", () => {
	it("verifies an account.updated Connect event signed with the Connect secret and sweeps pending transfers", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: "user-1",
			stripeAccountId: "acct_x",
		} as never);

		const payload = JSON.stringify({
			id: "evt_connect_1",
			type: "account.updated",
			data: { object: { id: "acct_x", payouts_enabled: true } },
		});

		// Connect events are signed with the Connect endpoint secret, and the
		// HTTP request carries NO Stripe-Account header — the only signal is
		// the signature itself.
		const res = await POST(buildRequest(payload, CONNECT_SECRET) as never);

		expect(res.status).toBe(200);
		expect(mockConnectService.syncAccountStatus).toHaveBeenCalled();
		expect(mockConnectService.sweepPendingTransfers).toHaveBeenCalledWith(
			"user-1",
		);
	});

	it("verifies a platform checkout.session.completed event signed with the platform secret", async () => {
		const payload = JSON.stringify({
			id: "evt_platform_1",
			type: "checkout.session.completed",
			data: { object: { id: "cs_test_1" } },
		});

		const res = await POST(buildRequest(payload, PLATFORM_SECRET) as never);

		expect(res.status).toBe(200);
	});

	it("returns 400 when the signature matches neither secret", async () => {
		const payload = JSON.stringify({ id: "evt_bad", type: "account.updated" });
		const res = await POST(buildRequest(payload, "whsec_wrong") as never);

		expect(res.status).toBe(400);
	});
});
