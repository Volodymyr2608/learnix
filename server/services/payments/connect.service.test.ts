import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Payment } from "@/generated/prisma";

// Explicit vi.fn() variables — avoids vi.mocked() and Stripe SDK typing issues
const mockAccountsCreate = vi.fn();
const mockAccountsRetrieve = vi.fn();
const mockAccountsCreateLoginLink = vi.fn();
const mockAccountLinksCreate = vi.fn();
const mockTransfersCreate = vi.fn();
const mockTransfersCreateReversal = vi.fn();

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

describe("ConnectService.transferToInstructor", () => {
	it("creates a Stripe Transfer and marks payment transferred when payoutsEnabled", async () => {
		const payment = makePayment({
			stripePaymentIntentId: "pi_test_abc",
		});

		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: true,
			stripePayoutsEnabled: true,
		} as never);

		const transfer = { id: "tr_test_xyz" };
		mockTransfersCreate.mockResolvedValue(transfer);
		mockPaymentRepo.update.mockResolvedValue(payment as never);

		await connectService.transferToInstructor(payment);

		expect(mockTransfersCreate).toHaveBeenCalledWith({
			amount: 4000,
			currency: "usd",
			destination: STRIPE_ACCOUNT_ID,
			source_transaction: "pi_test_abc",
		});
		expect(mockPaymentRepo.update).toHaveBeenCalledWith(
			payment.id,
			expect.objectContaining({
				transferStatus: "transferred",
				stripeTransferId: "tr_test_xyz",
				transferredAt: expect.any(Date),
			}),
		);
	});

	it("leaves transferStatus as pending when payoutsEnabled is false", async () => {
		const payment = makePayment();

		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: false,
			stripePayoutsEnabled: false,
		} as never);

		mockPaymentRepo.update.mockResolvedValue(payment as never);

		await connectService.transferToInstructor(payment);

		expect(mockTransfersCreate).not.toHaveBeenCalled();
		expect(mockPaymentRepo.update).toHaveBeenCalledWith(
			payment.id,
			expect.objectContaining({ transferStatus: "pending" }),
		);
	});
});

describe("ConnectService.sweepPendingTransfers", () => {
	it("transfers each pending payment for the instructor", async () => {
		const payments = [
			makePayment({ id: "pay_1" }),
			makePayment({ id: "pay_2" }),
		];

		mockPaymentRepo.findMany.mockResolvedValue(payments as never);

		// For each transferToInstructor call, the instructor profile will be fetched
		mockInstructorRepo.findFirst.mockResolvedValue({
			id: "prof-1",
			userId: INSTRUCTOR_ID,
			stripeAccountId: STRIPE_ACCOUNT_ID,
			stripeChargesEnabled: true,
			stripePayoutsEnabled: true,
		} as never);

		const transfer = { id: "tr_test_sweep" };
		mockTransfersCreate.mockResolvedValue(transfer);
		mockPaymentRepo.update.mockResolvedValue({} as never);

		await connectService.sweepPendingTransfers(INSTRUCTOR_ID);

		expect(mockPaymentRepo.findMany).toHaveBeenCalledWith({
			where: { instructorId: INSTRUCTOR_ID, transferStatus: "pending" },
		});
		expect(mockTransfersCreate).toHaveBeenCalledTimes(2);
	});

	it("does nothing when there are no pending payments", async () => {
		mockPaymentRepo.findMany.mockResolvedValue([] as never);

		await connectService.sweepPendingTransfers(INSTRUCTOR_ID);

		expect(mockTransfersCreate).not.toHaveBeenCalled();
	});
});

describe("ConnectService.reverseTransfer", () => {
	it("calls transfers.createReversal with the correct transfer id and marks payment reversed", async () => {
		const payment = makePayment({
			stripeTransferId: "tr_to_reverse",
			transferStatus: "transferred",
		});

		mockTransfersCreateReversal.mockResolvedValue({ id: "trr_test" });
		mockPaymentRepo.update.mockResolvedValue(payment as never);

		await connectService.reverseTransfer(payment);

		expect(mockTransfersCreateReversal).toHaveBeenCalledWith(
			"tr_to_reverse",
			{ refund_application_fee: false },
		);
		expect(mockPaymentRepo.update).toHaveBeenCalledWith(
			payment.id,
			expect.objectContaining({ transferStatus: "reversed" }),
		);
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

		expect(mockAccountsCreateLoginLink).toHaveBeenCalledWith(
			STRIPE_ACCOUNT_ID,
		);
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