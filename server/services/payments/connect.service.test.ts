import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@/generated/prisma";

// Explicit vi.fn() variables — avoids vi.mocked() and Stripe SDK typing issues
const mockAccountsCreate = vi.fn();
const mockAccountsRetrieve = vi.fn();
const mockAccountsCreateLoginLink = vi.fn();
const mockAccountLinksCreate = vi.fn();
const mockTransfersCreate = vi.fn();
const mockTransfersCreateReversal = vi.fn();
const mockTransfersList = vi.fn();
const mockTransfersListReversals = vi.fn();
const mockPaymentIntentsRetrieve = vi.fn();

// Mock stripe client
vi.mock("./stripe.client", () => ({
	stripe: {
		accounts: {
			create: mockAccountsCreate,
			retrieve: mockAccountsRetrieve,
			createLoginLink: mockAccountsCreateLoginLink,
		},
		accountLinks: {
			create: mockAccountLinksCreate,
		},
		transfers: {
			create: mockTransfersCreate,
			createReversal: mockTransfersCreateReversal,
			list: mockTransfersList,
			listReversals: mockTransfersListReversals,
		},
		paymentIntents: {
			retrieve: mockPaymentIntentsRetrieve,
		},
	},
}));

// Mock instructor repository
vi.mock("@/server/repositories/instructor.repository", () => ({
	instructorRepository: {
		findFirst: vi.fn(),
		update: vi.fn(),
		updateMany: vi.fn(),
	},
}));

// Mock payment repository
vi.mock("@/server/repositories/payment.repository", () => ({
	paymentRepository: {
		findMany: vi.fn(),
		update: vi.fn(),
		getOwedBalance: vi.fn(),
		aggregate: vi.fn(),
	},
}));

vi.mock("@/server/repositories/payout.repository", () => ({
	payoutRepository: {
		claimForRelease: vi.fn(),
		markTransferred: vi.fn(),
		releaseClaim: vi.fn(),
		touch: vi.fn(),
		markReversed: vi.fn(),
		isRefunded: vi.fn(),
	},
}));

// Mock env
vi.mock("@/lib/env", () => ({
	env: {
		BASE_URL: "https://learnix.test",
		STRIPE_SECRET_KEY: "sk_test_mock",
		STRIPE_WEBHOOK_SECRET: "whsec_mock",
		STRIPE_PLATFORM_FEE_PERCENT: 20,
	},
}));

// Mock connectStatus lib
vi.mock("@/lib/connectStatus", () => ({
	deriveConnectStatus: vi.fn(),
}));

const { connectService } = await import("./connect.service");
const { instructorRepository } = await import(
	"@/server/repositories/instructor.repository"
);
const { paymentRepository } = await import(
	"@/server/repositories/payment.repository"
);
const { deriveConnectStatus } = await import("@/lib/connectStatus");

const { payoutRepository } = await import(
	"@/server/repositories/payout.repository"
);
const mockPayoutRepo = vi.mocked(payoutRepository);
const mockInstructorRepo = vi.mocked(instructorRepository);
const mockPaymentRepo = vi.mocked(paymentRepository);
const mockDeriveConnectStatus = vi.mocked(deriveConnectStatus);

const INSTRUCTOR_ID = "instructor-1";
const STRIPE_ACCOUNT_ID = "acct_test123";

function makePayment(overrides: Partial<Payment> = {}): Payment {
	return {
		id: "pay_1",
		studentId: "student-1",
		courseId: "course-1",
		instructorId: INSTRUCTOR_ID,
		amountCents: 5000,
		currency: "usd",
		status: "succeeded",
		platformFeeCents: 1000,
		instructorNetCents: 4000,
		transferStatus: "pending",
		stripeTransferId: null,
		transferredAt: null,
		stripeCheckoutSessionId: "cs_test",
		stripePaymentIntentId: "pi_test",
		paidAt: null,
		refundedAt: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockAccountsCreate.mockReset();
	mockAccountsRetrieve.mockReset();
	mockAccountsCreateLoginLink.mockReset();
	mockAccountLinksCreate.mockReset();
	mockTransfersCreate.mockReset();
	mockTransfersCreateReversal.mockReset();
	mockTransfersList.mockReset();
	mockTransfersListReversals.mockReset();
	mockPaymentIntentsRetrieve.mockReset();
});

describe("ConnectService.getConnectStatus", () => {
	it("returns not_started when instructor has no stripeAccountId", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: null,
			stripeChargesEnabled: false,
			stripePayoutsEnabled: false,
			stripeOnboardedAt: null,
		} as never);

		const result = await connectService.getConnectStatus(INSTRUCTOR_ID);

		expect(result).toEqual({
			status: "not_started",
			availableCents: 0,
			owedCents: 0,
		});
		expect(mockAccountsRetrieve).not.toHaveBeenCalled();
	});

	it("retrieves Stripe account, calls deriveConnectStatus, and returns balances", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: true,
			stripePayoutsEnabled: true,
			stripeOnboardedAt: new Date(),
		} as never);

		const mockAccount = {
			id: STRIPE_ACCOUNT_ID,
			details_submitted: true,
			payouts_enabled: true,
			requirements: { currently_due: [], past_due: [], disabled_reason: null },
		};
		mockAccountsRetrieve.mockResolvedValue(mockAccount);
		mockDeriveConnectStatus.mockReturnValue("verified");
		mockPaymentRepo.getOwedBalance.mockResolvedValue(4000);
		mockPaymentRepo.aggregate.mockResolvedValue({
			_sum: { instructorNetCents: 12000 },
		} as never);

		const result = await connectService.getConnectStatus(INSTRUCTOR_ID);

		expect(mockAccountsRetrieve).toHaveBeenCalledWith(STRIPE_ACCOUNT_ID);
		expect(mockDeriveConnectStatus).toHaveBeenCalledWith(mockAccount);
		expect(result).toEqual({
			status: "verified",
			availableCents: 12000,
			owedCents: 4000,
		});
	});
});

describe("ConnectService.releasePayment (FR-P4, C7, ADR-037 §2)", () => {
	const NOW = new Date("2026-11-20T10:00:00.000Z");
	const connected = () =>
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
		} as never);
	const charge = (overrides: Record<string, unknown> = {}) =>
		mockPaymentIntentsRetrieve.mockResolvedValue({
			latest_charge: {
				id: "ch_test_abc",
				refunded: false,
				disputed: false,
				...overrides,
			},
		});

	beforeEach(() => {
		mockPayoutRepo.claimForRelease.mockResolvedValue(true);
		mockPayoutRepo.markTransferred.mockResolvedValue(true);
		mockPayoutRepo.releaseClaim.mockResolvedValue(true);
		mockPayoutRepo.isRefunded.mockResolvedValue(false);
		mockPayoutRepo.markReversed.mockResolvedValue(true);
		mockTransfersListReversals.mockResolvedValue({ data: [] });
		mockTransfersCreateReversal.mockResolvedValue({ id: "trr_1" });
		mockAccountsRetrieve.mockResolvedValue({ payouts_enabled: true });
		mockTransfersList.mockResolvedValue({ data: [] });
		connected();
		charge();
	});

	it("claims a pending payment, then transfers with an idempotency key and transfer_group", async () => {
		mockTransfersCreate.mockResolvedValue({ id: "tr_new" });

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome).toEqual({ kind: "released", paymentId: "pay_1" });
		expect(mockPayoutRepo.claimForRelease).toHaveBeenCalledWith("pay_1", NOW);
		expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith("pi_test", {
			expand: ["latest_charge"],
		});
		expect(mockTransfersCreate).toHaveBeenCalledWith(
			{
				amount: 4000,
				currency: "usd",
				destination: STRIPE_ACCOUNT_ID,
				source_transaction: "ch_test_abc",
				transfer_group: "pay_1",
			},
			{ idempotencyKey: "transfer:pay_1" },
		);
		expect(mockPayoutRepo.markTransferred).toHaveBeenCalledWith(
			"pay_1",
			"tr_new",
			NOW,
		);
	});

	it("does nothing when the claim is lost or the predicate forbids it", async () => {
		mockPayoutRepo.claimForRelease.mockResolvedValue(false);

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("not_eligible");
		expect(mockAccountsRetrieve).not.toHaveBeenCalled();
		expect(mockTransfersCreate).not.toHaveBeenCalled();
	});

	it.each([
		[
			"no Stripe account",
			() =>
				mockInstructorRepo.findFirst.mockResolvedValue({
					id: "prof-1",
					stripeAccountId: null,
				} as never),
		],
		[
			"payouts disabled",
			() => mockAccountsRetrieve.mockResolvedValue({ payouts_enabled: false }),
		],
	])("returns the claim to pending when the instructor has %s", async (_label, arrange) => {
		arrange();

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("waiting_for_stripe");
		expect(mockPayoutRepo.releaseClaim).toHaveBeenCalledWith("pay_1");
		expect(mockTransfersCreate).not.toHaveBeenCalled();
	});

	it.each([
		["refunded", { refunded: true }],
		["disputed", { disputed: true }],
	])("refuses to pay when the live charge is %s (H4)", async (_label, state) => {
		charge(state);

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("charge_not_payable");
		expect(mockPayoutRepo.releaseClaim).toHaveBeenCalledWith("pay_1");
		expect(mockTransfersCreate).not.toHaveBeenCalled();
	});

	it("marks a payment transferred without a new transfer when one exists for its group (AC-C7)", async () => {
		mockTransfersList.mockResolvedValue({ data: [{ id: "tr_existing" }] });

		const outcome = await connectService.releasePayment(
			makePayment({ transferStatus: "transferring" }),
			NOW,
		);

		expect(outcome.kind).toBe("already_transferred");
		expect(mockTransfersList).toHaveBeenCalledWith({
			transfer_group: "pay_1",
			limit: 1,
		});
		expect(mockTransfersCreate).not.toHaveBeenCalled();
		expect(mockPayoutRepo.markTransferred).toHaveBeenCalledWith(
			"pay_1",
			"tr_existing",
			NOW,
		);
	});

	it("records a transfer Stripe already made even when the charge is now disputed (review #2)", async () => {
		mockTransfersList.mockResolvedValue({ data: [{ id: "tr_made" }] });
		charge({ disputed: true });

		const outcome = await connectService.releasePayment(
			makePayment({ transferStatus: "transferring" }),
			NOW,
		);

		expect(outcome.kind).toBe("already_transferred");
		expect(mockPayoutRepo.markTransferred).toHaveBeenCalledWith(
			"pay_1",
			"tr_made",
			NOW,
		);
		expect(mockPayoutRepo.releaseClaim).not.toHaveBeenCalled();
	});

	it("finds a legacy transfer made without a transfer_group by its source charge (review #3)", async () => {
		mockTransfersList.mockImplementation(
			async (params: Record<string, unknown>) =>
				params.destination
					? {
							data: [
								{ id: "tr_other", source_transaction: "ch_other" },
								{ id: "tr_legacy", source_transaction: "ch_test_abc" },
							],
						}
					: { data: [] },
		);

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("already_transferred");
		expect(mockTransfersList).toHaveBeenCalledWith(
			expect.objectContaining({ destination: STRIPE_ACCOUNT_ID }),
		);
		expect(mockTransfersCreate).not.toHaveBeenCalled();
		expect(mockPayoutRepo.markTransferred).toHaveBeenCalledWith(
			"pay_1",
			"tr_legacy",
			NOW,
		);
	});

	it("finds a legacy transfer on a later page of the destination list (audit Medium-1)", async () => {
		mockTransfersList.mockImplementation(
			async (params: Record<string, unknown>) => {
				if (!params.destination) return { data: [] };
				return params.starting_after
					? {
							data: [{ id: "tr_legacy", source_transaction: "ch_test_abc" }],
							has_more: false,
						}
					: {
							data: [{ id: "tr_page1", source_transaction: "ch_other" }],
							has_more: true,
						};
			},
		);

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("already_transferred");
		expect(mockTransfersList).toHaveBeenCalledWith(
			expect.objectContaining({ starting_after: "tr_page1" }),
		);
		expect(mockTransfersCreate).not.toHaveBeenCalled();
	});

	it("reverses a transfer found for a payment refunded meanwhile (C5 remainder)", async () => {
		mockTransfersList.mockResolvedValue({ data: [{ id: "tr_made" }] });
		mockPayoutRepo.isRefunded.mockResolvedValue(true);

		const outcome = await connectService.releasePayment(
			makePayment({ transferStatus: "transferring" }),
			NOW,
		);

		expect(outcome).toEqual({
			kind: "reversed_after_refund",
			paymentId: "pay_1",
		});
		expect(mockTransfersCreateReversal).toHaveBeenCalledWith(
			"tr_made",
			{ refund_application_fee: false },
			{ idempotencyKey: "reversal:pay_1" },
		);
		expect(mockPayoutRepo.markReversed).toHaveBeenCalledWith("pay_1");
	});

	it("reverses a transfer it just created when the payment was refunded during the call (AC-C5)", async () => {
		mockTransfersCreate.mockResolvedValue({ id: "tr_new" });
		mockPayoutRepo.isRefunded.mockResolvedValue(true);

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome.kind).toBe("reversed_after_refund");
		expect(mockTransfersCreateReversal).toHaveBeenCalledTimes(1);
		expect(mockTransfersCreateReversal.mock.calls[0]?.[0]).toBe("tr_new");
	});

	it("moves a failing payment to the back of the queue (audit Low-2)", async () => {
		mockTransfersCreate.mockRejectedValue(new Error("Stripe timeout"));

		await connectService.releasePayment(makePayment(), NOW);

		expect(mockPayoutRepo.touch).toHaveBeenCalledWith("pay_1");
	});

	it("recovers a transferring payment without claiming it again", async () => {
		mockTransfersCreate.mockResolvedValue({ id: "tr_new" });

		const outcome = await connectService.releasePayment(
			makePayment({ transferStatus: "transferring" }),
			NOW,
		);

		expect(outcome.kind).toBe("released");
		expect(mockPayoutRepo.claimForRelease).not.toHaveBeenCalled();
	});

	it("leaves the payment transferring and reports the error when Stripe fails (H5)", async () => {
		mockTransfersCreate.mockRejectedValue(new Error("Stripe timeout"));

		const outcome = await connectService.releasePayment(makePayment(), NOW);

		expect(outcome).toEqual({
			kind: "failed",
			paymentId: "pay_1",
			error: "Stripe timeout",
		});
		expect(mockPayoutRepo.releaseClaim).not.toHaveBeenCalled();
		expect(mockPayoutRepo.markTransferred).not.toHaveBeenCalled();
	});

	it("never touches a payment that is neither pending nor transferring", async () => {
		const outcome = await connectService.releasePayment(
			makePayment({ transferStatus: "transferred" }),
			NOW,
		);

		expect(outcome.kind).toBe("not_eligible");
		expect(mockPayoutRepo.claimForRelease).not.toHaveBeenCalled();
	});
});

describe("ConnectService.reverseTransfer (C7, ADR-037 §2)", () => {
	const transferred = () =>
		makePayment({
			stripeTransferId: "tr_to_reverse",
			transferStatus: "transferred",
		});

	beforeEach(() => {
		mockTransfersListReversals.mockResolvedValue({ data: [] });
		mockPayoutRepo.markReversed.mockResolvedValue(true);
	});

	it("creates one reversal with an idempotency key and marks the payment reversed", async () => {
		mockTransfersCreateReversal.mockResolvedValue({ id: "trr_new" });

		await connectService.reverseTransfer(transferred());

		expect(mockTransfersListReversals).toHaveBeenCalledWith("tr_to_reverse", {
			limit: 1,
		});
		expect(mockTransfersCreateReversal).toHaveBeenCalledWith(
			"tr_to_reverse",
			{ refund_application_fee: false },
			{ idempotencyKey: "reversal:pay_1" },
		);
		expect(mockPayoutRepo.markReversed).toHaveBeenCalledWith("pay_1");
	});

	it("records an existing reversal instead of creating a second one", async () => {
		mockTransfersListReversals.mockResolvedValue({ data: [{ id: "trr_old" }] });

		await connectService.reverseTransfer(transferred());

		expect(mockTransfersCreateReversal).not.toHaveBeenCalled();
		expect(mockPayoutRepo.markReversed).toHaveBeenCalledWith("pay_1");
	});

	it("does not throw when another path already marked it reversed", async () => {
		mockTransfersCreateReversal.mockResolvedValue({ id: "trr_new" });
		mockPayoutRepo.markReversed.mockResolvedValue(false);

		await expect(
			connectService.reverseTransfer(transferred()),
		).resolves.toBeUndefined();
	});

	it("refuses a payment without a transfer id", async () => {
		await expect(
			connectService.reverseTransfer(makePayment({ stripeTransferId: null })),
		).rejects.toThrow(/no stripeTransferId/);
	});
});

describe("ConnectService.createOnboardingLink", () => {
	it("creates a new Stripe account when none exists and returns the link url", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: null,
		} as never);

		mockAccountsCreate.mockResolvedValue({ id: "acct_new" });
		mockInstructorRepo.update.mockResolvedValue({} as never);
		mockAccountLinksCreate.mockResolvedValue({
			url: "https://connect.stripe.com/onboard/acct_new",
		});

		const result = await connectService.createOnboardingLink(INSTRUCTOR_ID);

		expect(mockAccountsCreate).toHaveBeenCalledWith({
			type: "express",
		});
		expect(mockInstructorRepo.update).toHaveBeenCalledWith(
			"prof-1",
			expect.objectContaining({ stripeAccountId: "acct_new" }),
		);
		expect(mockAccountLinksCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				account: "acct_new",
				type: "account_onboarding",
				refresh_url: "https://learnix.test/settings?stripe=refresh",
				return_url: "https://learnix.test/settings?stripe=return",
			}),
		);
		expect(result).toEqual({
			url: "https://connect.stripe.com/onboard/acct_new",
		});
	});

	it("reuses existing stripeAccountId when one is already set", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
		} as never);

		mockAccountLinksCreate.mockResolvedValue({
			url: "https://connect.stripe.com/onboard/acct_test123",
		});

		await connectService.createOnboardingLink(INSTRUCTOR_ID);

		expect(mockAccountsCreate).not.toHaveBeenCalled();
		expect(mockAccountLinksCreate).toHaveBeenCalledWith(
			expect.objectContaining({ account: STRIPE_ACCOUNT_ID }),
		);
	});
});

describe("ConnectService.createLoginLink", () => {
	it("calls createLoginLink with the instructor stripeAccountId", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
		} as never);

		mockAccountsCreateLoginLink.mockResolvedValue({
			url: "https://connect.stripe.com/login/acct_test123",
		});

		const result = await connectService.createLoginLink(INSTRUCTOR_ID);

		expect(mockAccountsCreateLoginLink).toHaveBeenCalledWith(STRIPE_ACCOUNT_ID);
		expect(result).toEqual({
			url: "https://connect.stripe.com/login/acct_test123",
		});
	});
});

describe("ConnectService.syncAccountStatus", () => {
	it("updates stripeChargesEnabled and stripePayoutsEnabled on the profile", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: false,
			stripePayoutsEnabled: false,
			stripeOnboardedAt: null,
		} as never);
		mockInstructorRepo.update.mockResolvedValue({} as never);

		await connectService.syncAccountStatus({
			id: STRIPE_ACCOUNT_ID,
			charges_enabled: true,
			payouts_enabled: true,
		});

		expect(mockInstructorRepo.update).toHaveBeenCalledWith(
			"prof-1",
			expect.objectContaining({
				stripeChargesEnabled: true,
				stripePayoutsEnabled: true,
				stripeOnboardedAt: expect.any(Date),
			}),
		);
	});

	it("does not set stripeOnboardedAt when payouts_enabled is false", async () => {
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: false,
			stripePayoutsEnabled: false,
			stripeOnboardedAt: null,
		} as never);
		mockInstructorRepo.update.mockResolvedValue({} as never);

		await connectService.syncAccountStatus({
			id: STRIPE_ACCOUNT_ID,
			charges_enabled: true,
			payouts_enabled: false,
		});

		const callArg = mockInstructorRepo.update.mock.calls[0]?.[1] as
			| Record<string, unknown>
			| undefined;
		expect(callArg?.stripeOnboardedAt).toBeUndefined();
	});
});
